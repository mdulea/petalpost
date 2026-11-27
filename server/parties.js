// Deep party access, link secret derivation/verification, and reply storage module.
// Owns guest-list host gating, owned-party lookup (uniform 404 partyMissing on host routes), SQL reply JSONB
// hydration and serialization, lockstep party-and-reply version mutations, read-only REPEATABLE READ tracker
// snapshots with out-of-transaction view-link backfill, and open-mode reply storage with 410 ended resolution.
import { isDeadlinePassed } from '../public/js/countdown.js';
import { validPartyName } from '../public/js/guest-list.js';
import { normalizeLang } from '../public/js/i18n.js';
import {
  menuOptionIds,
  modeOf,
  normalizePartySubEvents,
  partyInvite,
  partySubEventIds,
  subEventIds,
} from '../public/js/invite.js';
import {
  ID_PATTERN,
  importPartySigningKey,
  makeReply,
  newId,
  PARTY_LIMITS,
  partyReply,
  signPartySecret,
  tally,
  viewLinkSecret,
} from '../public/js/rsvp.js';
import { isSeatingPublished, tableSeats } from '../public/js/seating.js';
import { isEnded, projectInvitation, readInvitation, verifyHost } from './invitations.js';
import { addCount, hash, matches, Refusal } from './routes/shared.js';

export const EVENT_RESPONSES = 200;

// SQL JSONB serialization helpers kept server-side so browser modules carry no Postgres storage formatting.
const answersOf = (stored) => (stored && Object.keys(stored).length ? { answers: stored } : {});
const storedAnswers = (reply) => JSON.stringify(reply.answers ?? {});
const mealsOf = (stored) => (stored && Object.keys(stored).length ? { meals: stored } : {});
const storedMeals = (reply) => JSON.stringify(reply.meals ?? {});

const PARTY_REPLY_COLUMNS = 'r.attending, r.party_size, r.answers, r.meals, r.note, r.version as reply_version';

// Hydrates a stored response row into its API shape.
function hydrateReply(
  row,
  {
    includeId = false,
    includeName = false,
    includeVersion = false,
    includeTimestamps = false,
    subEventIds: partyIds = null,
    versionKey = 'version',
  } = {},
) {
  const reply = {
    ...(includeId ? { id: row.id } : {}),
    ...(includeName ? { name: row.name } : {}),
    attending: row.attending,
    partySize: row.party_size,
    ...answersOf(row.answers),
    ...mealsOf(row.meals),
    note: row.note,
    ...(includeVersion ? { version: row[versionKey] } : {}),
    ...(includeTimestamps
      ? { createdAt: new Date(row.created_at).toISOString(), updatedAt: new Date(row.updated_at).toISOString() }
      : {}),
  };
  return partyIds ? partyReply(reply, partyIds) : reply;
}

const hydratePartyReply = (row, ids) =>
  row?.reply_version == null
    ? null
    : hydrateReply(row, { includeVersion: true, versionKey: 'reply_version', subEventIds: ids });

// Verifies a host credential and enforces guest-list mode.
/**
 * @param {any} tx
 * @param {string} eventId
 * @param {string} credential
 * @param {{ lock?: 'update' | 'key share' | false, token?: boolean, modeCode?: string }} [options]
 */
export async function requireGuestListHost(tx, eventId, credential, options = {}) {
  const { lock = 'update', token = true, modeCode = 'partyMode' } = options;
  const event = await verifyHost(tx, eventId, credential, { lock, token });
  if (modeOf(event.d) !== 'guestList') throw new Refusal(403, modeCode);
  return event;
}

// Loads a party owned by eventId (optionally locked) and always refuses missing parties with host 404 partyMissing.
/**
 * @param {any} tx
 * @param {string} eventId
 * @param {string} partyId
 * @param {{ columns?: string, lock?: 'update' | false }} [options]
 */
export async function requireOwnedParty(tx, eventId, partyId, options = {}) {
  const { columns = 'id', lock = 'update' } = options;
  const {
    rows: [party],
  } = await tx.query(`select ${columns} from parties where id = $1 and event_id = $2${lock ? ` for ${lock}` : ''}`, [
    partyId,
    eventId,
  ]);
  if (!party) throw new Refusal(404, 'partyMissing');
  return party;
}

function verifyPartyLink(party, secret, hashColumn = 'secret_hash') {
  if (!party || party.revoked || !matches(secret, party[hashColumn])) throw new Refusal(404, 'personalLink');
}

async function deriveHashesWithKey(signingKey, partyId, generation = null) {
  const personal = await signPartySecret(signingKey, partyId, 'personal', generation);
  const view = await viewLinkSecret(personal, partyId);
  return { personal, secret_hash: hash(personal), view_hash: hash(view) };
}

// Inserts one or more parties with idempotent client-generated ids, importing the HMAC key once per batch.
export async function insertParties(db, eventId, secret, entries, defaultSeats, lang) {
  const parties = new Map();
  for (const entry of entries) {
    const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
    if (typeof entry?.id !== 'string' || !ID_PATTERN.test(entry.id) || parties.has(entry.id)) {
      throw new Refusal(400, 'id');
    }
    if (!validPartyName(name)) throw new Refusal(400, 'party');
    parties.set(entry.id, name);
  }
  if (!Number.isInteger(defaultSeats) || defaultSeats < 1 || defaultSeats > PARTY_LIMITS.seats) {
    throw new Refusal(400, 'party');
  }

  return db.transaction(async (tx) => {
    await requireGuestListHost(tx, eventId, secret, { token: false });
    const { rows: existing } = await tx.query('select id, event_id from parties where id = any($1::text[])', [
      [...parties.keys()],
    ]);
    for (const party of existing) {
      if (party.event_id !== eventId) throw new Refusal(409, 'partyId');
      parties.delete(party.id);
    }
    if (!parties.size) return false;
    const { count } = (await tx.query('select count(*)::int as count from parties where event_id = $1', [eventId]))
      .rows[0];
    if (count + parties.size > PARTY_LIMITS.count) throw new Refusal(429, 'partyLimit');
    const signingKey = await importPartySigningKey(secret);
    const records = await Promise.all(
      [...parties].map(async ([id, name]) => {
        const { secret_hash, view_hash } = await deriveHashesWithKey(signingKey, id);
        return { id, name, secret_hash, view_hash };
      }),
    );
    const { rows } = await tx.query(
      `insert into parties (id, event_id, name, lang, default_seats, secret_hash, view_hash)
       select id, $1, name, $2, $3, secret_hash, view_hash
       from jsonb_to_recordset($4) as entry(id text, name text, secret_hash text, view_hash text)
       on conflict (id) do nothing returning id`,
      [eventId, normalizeLang(lang), defaultSeats, JSON.stringify(records)],
    );
    if (rows.length !== parties.size) throw new Refusal(409, 'partyId');
    return true;
  });
}

// Backfills legacy view hashes outside the REPEATABLE READ snapshot transaction so concurrent party edits never
// trigger serialization failures. Conditional WHERE guards against overwriting concurrent revokes or regenerations.
async function backfillViewHashes(db, eventId, managementSecret, candidates) {
  const active = candidates.filter((party) => !party.revoked);
  if (!active.length) return;
  const signingKey = await importPartySigningKey(managementSecret);
  const updates = (
    await Promise.all(
      active.map(async (party) => {
        const personal = await signPartySecret(signingKey, party.id, 'personal', party.link_generation);
        const viewHash = hash(await viewLinkSecret(personal, party.id));
        if (viewHash === party.view_hash || !matches(personal, party.secret_hash)) return null;
        return { id: party.id, secret_hash: party.secret_hash, previous_hash: party.view_hash, view_hash: viewHash };
      }),
    )
  ).filter(Boolean);
  if (!updates.length) return;
  await db.query(
    `update parties p set view_hash = v.view_hash
     from jsonb_to_recordset($2) as v(id text, secret_hash text, previous_hash text, view_hash text)
     where p.event_id = $1 and p.id = v.id and not p.revoked
       and p.secret_hash = v.secret_hash and p.view_hash = v.previous_hash`,
    [eventId, JSON.stringify(updates)],
  );
}

// Reads the tracker snapshot in a read-only REPEATABLE READ transaction so concurrently attached replies appear
// exactly once, then backfills any legacy view hashes outside the snapshot transaction.
export async function listTrackerResponses(db, eventId, credential) {
  const { payload, previewCandidates } = await db.transaction(async (tx) => {
    await tx.query('set transaction isolation level repeatable read read only');
    const event = await verifyHost(tx, eventId, credential, { lock: false });
    const hasGuestList = modeOf(event.d) === 'guestList';
    const { rows } = await tx.query(
      `select id, name, attending, party_size, answers, meals, note, created_at, updated_at from responses
       where event_id = $1${hasGuestList ? ' and party_id is null' : ''} order by created_at, updated_at`,
      [eventId],
    );
    const responses = rows.map((row) =>
      hydrateReply(row, { includeId: hasGuestList, includeName: true, includeTimestamps: true }),
    );
    let parties;
    let tables;
    let candidates = [];
    if (hasGuestList) {
      const { rows: partyRows } = await tx.query(
        `select p.id, p.name, p.lang, p.default_seats, p.sub_events, p.revoked, p.link_generation, p.secret_hash,
                p.view_hash, p.table_id, p.first_opened_at, p.last_opened_at, ${PARTY_REPLY_COLUMNS}
         from parties p left join responses r on r.party_id = p.id
         where p.event_id = $1 order by p.created_at, p.id`,
        [eventId],
      );
      if (event.auth === 'secret') candidates = partyRows;
      parties = partyRows.map((p) => {
        const subEvents = partySubEventIds(event.d, p.sub_events);
        return {
          id: p.id,
          name: p.name,
          lang: p.lang,
          defaultSeats: p.default_seats,
          revoked: p.revoked,
          linkGeneration: p.link_generation,
          firstOpenedAt: p.first_opened_at ? new Date(p.first_opened_at).toISOString() : null,
          lastOpenedAt: p.last_opened_at ? new Date(p.last_opened_at).toISOString() : null,
          tableId: p.table_id,
          subEvents,
          reply: hydratePartyReply(p, subEvents),
        };
      });
      const { rows: tableRows } = await tx.query(
        'select id, name, capacity, version from seating_tables where event_id = $1 order by created_at, id',
        [eventId],
      );
      tables = tableSeats(tableRows, parties);
    }
    return {
      payload: {
        ...projectInvitation(event, { includeUpdate: true }),
        version: event.version,
        responses,
        totals: tally(responses),
        parties,
        tables,
      },
      previewCandidates: candidates,
    };
  });

  if (previewCandidates.length) await backfillViewHashes(db, eventId, credential, previewCandidates);
  return payload;
}

export function changePartyLink(db, eventId, partyId, secret, { action, linkGeneration }) {
  return db.transaction(async (tx) => {
    await requireGuestListHost(tx, eventId, secret, { token: false });
    const party = await requireOwnedParty(tx, eventId, partyId, { columns: 'link_generation' });
    if (party.link_generation !== linkGeneration) throw new Refusal(409, 'partyLinkChanged');
    if (action === 'revoke') {
      await tx.query('update parties set revoked = true where id = $1', [partyId]);
    } else {
      const generation = newId();
      const signingKey = await importPartySigningKey(secret);
      const { secret_hash, view_hash } = await deriveHashesWithKey(signingKey, partyId, generation);
      await tx.query(
        'update parties set revoked = false, link_generation = $2, secret_hash = $3, view_hash = $4 where id = $1',
        [partyId, generation, secret_hash, view_hash],
      );
    }
  });
}

export function renameParty(db, eventId, partyId, secret, name) {
  return db.transaction(async (tx) => {
    await requireGuestListHost(tx, eventId, secret);
    const result = await tx.query(
      'update parties set name = $3, updated_at = now() where id = $1 and event_id = $2 returning id',
      [partyId, eventId, name],
    );
    if (!result.rows.length) throw new Refusal(404, 'partyMissing');
  });
}

export function deleteParty(db, eventId, partyId, secret) {
  return db.transaction(async (tx) => {
    await requireGuestListHost(tx, eventId, secret);
    await tx.query('delete from parties where id = $1 and event_id = $2', [partyId, eventId]);
  });
}

export async function readPartyView(db, eventId, partyId, secret) {
  const {
    rows: [party],
  } = await db.query(
    `select p.name, p.view_hash, p.revoked, p.sub_events, e.t, e.d
     from parties p join events e on e.id = p.event_id where p.id = $1 and p.event_id = $2`,
    [partyId, eventId],
  );
  if (!party && (await isEnded(db, eventId))) throw new Refusal(410, 'eventEnded');
  verifyPartyLink(party, secret, 'view_hash');
  const invite = { t: party.t, d: partyInvite(party.d, party.sub_events) };
  return { ...projectInvitation(invite, { includeUpdate: true }), name: party.name };
}

export async function readPartyPersonal(db, eventId, partyId, secret, now) {
  const {
    rows: [party],
  } = await db.query(
    `select p.name, p.default_seats, p.sub_events, p.secret_hash, p.revoked, e.t, e.d, ${PARTY_REPLY_COLUMNS},
            t.name as table_name
     from parties p join events e on e.id = p.event_id left join responses r on r.party_id = p.id
     left join seating_tables t on t.id = p.table_id where p.id = $1 and p.event_id = $2`,
    [partyId, eventId],
  );
  if (!party && (await isEnded(db, eventId))) throw new Refusal(410, 'eventEnded');
  verifyPartyLink(party, secret);
  const view = await viewLinkSecret(secret, partyId);
  // Use the current credential so a concurrent revoke or regeneration cannot record a stale open.
  const opened = await db.query(
    `update parties
     set first_opened_at = coalesce(first_opened_at, now()), last_opened_at = greatest(last_opened_at, now()),
         view_hash = $1
     where id = $2 and event_id = $3 and secret_hash = $4 and not revoked returning id`,
    [hash(view), partyId, eventId, party.secret_hash],
  );
  if (!opened.rows.length) throw new Refusal(404, 'personalLink');
  return {
    ...projectInvitation({ t: party.t, d: partyInvite(party.d, party.sub_events) }, { includeUpdate: true }),
    name: party.name,
    defaultSeats: party.default_seats,
    reply: hydratePartyReply(party, partySubEventIds(party.d, party.sub_events)),
    deadlineClosed: isDeadlinePassed(party.d?.deadline, now()),
    table: isSeatingPublished(party.d) ? (party.table_name ?? null) : null,
  };
}

async function currentPartyReply(tx, partyId, ids) {
  const {
    rows: [reply],
  } = await tx.query(`select ${PARTY_REPLY_COLUMNS} from responses r where party_id = $1`, [partyId]);
  return hydratePartyReply(reply, ids);
}

// Serializes guest reply changes through the party row after locking the parent invitation in deletion order.
async function lockPartyForGuestReply(tx, eventId, partyId, secret, now) {
  const {
    rows: [event],
  } = await tx.query('select d from events where id = $1 for key share', [eventId]);
  const {
    rows: [party],
  } = await tx.query(
    'select name, secret_hash, revoked, version, sub_events from parties where id = $1 and event_id = $2 for update',
    [partyId, eventId],
  );
  if (!party && (await isEnded(tx, eventId))) throw new Refusal(410, 'eventEnded');
  verifyPartyLink(party, secret);
  if (isDeadlinePassed(event?.d?.deadline, now())) throw new Refusal(403, 'deadlinePassed');
  const ids = partySubEventIds(event.d, party.sub_events);
  return { ...party, d: event.d, subEventIds: ids, reply: await currentPartyReply(tx, partyId, ids) };
}

// Advances the party's monotonic version in lockstep with a reply write or attachment.
async function advancePartyVersion(tx, partyId, currentVersion) {
  const nextVersion = currentVersion + 1;
  await tx.query('update parties set version = $2 where id = $1', [partyId, nextVersion]);
  return nextVersion;
}

// Verifies the reply version, upserts the party's reply and advances the party version in lockstep.
async function writePartyReply(tx, eventId, partyId, party, reply, expectedVersion) {
  if (expectedVersion !== party.reply?.version) throw new Refusal(409, 'replyChanged', { reply: party.reply });
  const version = await advancePartyVersion(tx, partyId, party.version);
  await tx.query(
    `insert into responses (id, event_id, party_id, name, attending, party_size, answers, meals, note, version)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     on conflict (party_id) do update set attending = excluded.attending, party_size = excluded.party_size,
     answers = excluded.answers, meals = excluded.meals, note = excluded.note, version = excluded.version,
     updated_at = now()`,
    [
      newId(),
      eventId,
      partyId,
      reply.name,
      reply.attending,
      reply.partySize,
      storedAnswers(reply),
      storedMeals(reply),
      reply.note,
      version,
    ],
  );
  return version;
}

export function saveGuestPartyReply(db, eventId, partyId, secret, body, now) {
  return db.transaction(async (tx) => {
    const party = await lockPartyForGuestReply(tx, eventId, partyId, secret, now);
    const { reply } = makeReply(
      { ...body, name: party.name },
      { partySizeLimit: PARTY_LIMITS.seats, subEventIds: party.subEventIds, menuIds: menuOptionIds(party.d) },
    );
    if (!reply) throw new Refusal(400, 'partyReply');
    const version = await writePartyReply(tx, eventId, partyId, party, reply, body.version);
    if (!party.reply) await addCount(tx, 'reply_submit', normalizeLang(body.lang));
    return { status: party.reply ? 200 : 201, body: { version } };
  });
}

export function withdrawGuestPartyReply(db, eventId, partyId, secret, version, now) {
  return db.transaction(async (tx) => {
    const { reply } = await lockPartyForGuestReply(tx, eventId, partyId, secret, now);
    if (reply) {
      if (version !== reply.version) throw new Refusal(409, 'replyChanged', { reply });
      await tx.query('delete from responses where party_id = $1', [partyId]);
    }
  });
}

export function saveHostPartyReply(db, eventId, partyId, secret, body) {
  return db.transaction(async (tx) => {
    const event = await requireGuestListHost(tx, eventId, secret, { token: false });
    const party = await requireOwnedParty(tx, eventId, partyId, { columns: 'name, version, sub_events' });
    const ids = partySubEventIds(event.d, party.sub_events);
    const { reply } = makeReply(
      { ...body, name: party.name },
      { partySizeLimit: PARTY_LIMITS.seats, subEventIds: ids, menuIds: menuOptionIds(event.d) },
    );
    if (!reply) throw new Refusal(400, 'partyReply');
    const current = await currentPartyReply(tx, partyId, ids);
    const version = await writePartyReply(tx, eventId, partyId, { ...party, reply: current }, reply, body.version);
    return { status: current ? 200 : 201, body: { version } };
  });
}

export function setPartySeats(db, eventId, partyId, secret, { partySize, meals, version }) {
  return db.transaction(async (tx) => {
    const event = await requireGuestListHost(tx, eventId, secret);
    if (subEventIds(event.d).length) throw new Refusal(400, 'partySeatsBySubEvent');
    const party = await requireOwnedParty(tx, eventId, partyId, { columns: 'name, version' });
    const current = await currentPartyReply(tx, partyId, []);
    const { reply } = makeReply(
      { name: party.name, attending: partySize > 0, partySize, meals, note: current?.note ?? '' },
      { partySizeLimit: PARTY_LIMITS.seats, menuIds: menuOptionIds(event.d) },
    );
    if (!reply) throw new Refusal(400, 'partyMeals');
    const nextVersion = await writePartyReply(tx, eventId, partyId, { ...party, reply: current }, reply, version);
    return { version: nextVersion };
  });
}

export function setPartySubEvents(db, eventId, secret, ids, chosen) {
  return db.transaction(async (tx) => {
    const event = await requireGuestListHost(tx, eventId, secret);
    const stored = normalizePartySubEvents(event.d, chosen);
    if (!stored) throw new Refusal(400, 'partySubEvents');
    const { rows } = await tx.query(
      `update parties set sub_events = $3::text::jsonb, updated_at = now()
       where event_id = $1 and id = any($2::text[]) returning id`,
      [eventId, ids, JSON.stringify(stored)],
    );
    if (rows.length !== ids.length) throw new Refusal(404, 'partyMissing');
  });
}

export async function assignPartyTable(tx, eventId, partyId, tableId) {
  const { rows } = await tx.query('update parties set table_id = $3 where event_id = $1 and id = $2 returning id', [
    eventId,
    partyId,
    tableId,
  ]);
  if (!rows.length) throw new Refusal(404, 'partyMissing');
}

// Attaches an earlier unattached open-mode reply to a party and advances both versions in lockstep.
export function attachReplyToParty(db, eventId, replyId, partyId, secret) {
  return db.transaction(async (tx) => {
    await requireGuestListHost(tx, eventId, secret, { token: false });
    const party = await requireOwnedParty(tx, eventId, partyId, { columns: 'id, version' });
    const reply = (
      await tx.query('select id, party_id from responses where id = $1 and event_id = $2 for update', [
        replyId,
        eventId,
      ])
    ).rows[0];
    if (!reply) throw new Refusal(404, 'replyMissing');
    if (reply.party_id === partyId) return;
    if (reply.party_id !== null) throw new Refusal(409, 'replyAttached');
    const existing = (await tx.query('select 1 from responses where party_id = $1 limit 1', [partyId])).rows.length > 0;
    if (existing) throw new Refusal(409, 'partyHasReply');
    const version = await advancePartyVersion(tx, partyId, party.version);
    await tx.query(
      'update responses set party_id = $2, secret_hash = null, version = $3, updated_at = now() where id = $1',
      [replyId, partyId, version],
    );
  });
}

// Open-mode reply lookup, locked for update, after checking invitation ownership and edit secret.
async function ownedOpenReply(tx, eventId, id, secret) {
  const reply = (
    await tx.query(
      'select event_id, secret_hash, name, attending, party_size, answers, meals, note, version from responses where id = $1 and secret_hash is not null for update',
      [id],
    )
  ).rows[0];
  if (!reply) return null;
  if (reply.event_id !== eventId || !matches(secret, reply.secret_hash)) throw new Refusal(403, 'replyForbidden');
  return reply;
}

export function readOpenReply(db, eventId, replyId, secret) {
  return db.transaction(async (tx) => {
    const event = await readInvitation(tx, eventId);
    if (modeOf(event.d) === 'guestList') throw new Refusal(404, 'replyLinkUnavailable');
    const reply = await ownedOpenReply(tx, eventId, replyId, secret);
    if (!reply) throw new Refusal(404, 'replyMissing');
    return hydrateReply(reply, { includeName: true, includeVersion: true });
  });
}

export function saveOpenReply(db, eventId, replyId, secret, body) {
  return db.transaction(async (tx) => {
    // The event row lock serializes the count and insert below across concurrent replies to one event.
    const event = await readInvitation(tx, eventId, { lock: 'update' });
    if (modeOf(event.d) === 'guestList') throw new Refusal(403, 'guestListReply');
    const { reply } = makeReply(body, { subEventIds: subEventIds(event.d), menuIds: menuOptionIds(event.d) });
    if (!reply) throw new Refusal(400, 'reply');
    const answers = storedAnswers(reply);
    const meals = storedMeals(reply);
    const existing = await ownedOpenReply(tx, eventId, replyId, secret);
    if (existing) {
      if (body.version === undefined) return { status: 200, body: { version: existing.version, created: false } };
      if (body.version !== existing.version) {
        throw new Refusal(409, 'replyChanged', hydrateReply(existing, { includeName: true, includeVersion: true }));
      }
      await tx.query(
        `update responses set name = $2, attending = $3, party_size = $4, note = $5, answers = $6, meals = $7,
         version = version + 1, updated_at = now() where id = $1`,
        // A page loaded before replies had notes sends none, so an update without the field keeps the stored note.
        [
          replyId,
          reply.name,
          reply.attending,
          reply.partySize,
          body.note === undefined ? existing.note : reply.note,
          answers,
          meals,
        ],
      );
      return { status: 200, body: { version: existing.version + 1, created: false } };
    }
    if (body.version !== undefined) throw new Refusal(404, 'replyMissing');
    const { count } = (await tx.query('select count(*)::int as count from responses where event_id = $1', [eventId]))
      .rows[0];
    if (count >= EVENT_RESPONSES) throw new Refusal(429, 'eventFull');
    await tx.query(
      `insert into responses (id, event_id, secret_hash, name, attending, party_size, answers, meals, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [replyId, eventId, hash(secret), reply.name, reply.attending, reply.partySize, answers, meals, reply.note],
    );
    await addCount(tx, 'reply_submit', normalizeLang(body.lang));
    return { status: 201, body: { version: 1, created: true } };
  });
}

export function withdrawOpenReply(db, eventId, replyId, secret, version) {
  return db.transaction(async (tx) => {
    // The same event row lock as saveOpenReply, so a withdrawal and a new reply to one event take turns.
    const event = await readInvitation(tx, eventId, { lock: 'update' });
    if (modeOf(event.d) === 'guestList') throw new Refusal(403, 'guestListReply');
    const existing = await ownedOpenReply(tx, eventId, replyId, secret);
    if (!existing) return;
    if (version !== existing.version) {
      throw new Refusal(409, 'replyChanged', hydrateReply(existing, { includeName: true, includeVersion: true }));
    }
    await tx.query('delete from responses where id = $1', [replyId]);
  });
}
