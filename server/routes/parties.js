// Under /api/events/{eventId}/parties, POST with the management secret adds a batch from
// {entries: [{id, name}], defaultSeats, lang}. PUT /{id} adds one from {name, defaultSeats, lang}.
// On /{id}, GET uses the personal secret, records the first and last opened times and returns {t, d, name, defaultSeats, reply}.
// GET on /{id}/view uses the view secret and returns {t, d, name} without recording an opened time.
// PATCH with the personal secret saves {attending, partySize, note?, version?, lang?} and returns {version}.
// DELETE with the same secret and {version} withdraws the reply. A stale write gets 409 and the current reply.
// PATCH on /{id}/link needs the management secret and {action, linkGeneration}.
// Action 'revoke' disables the link. Action 'regenerate' replaces both secrets and enables the new links.
// Both preserve the reply and return 204. A request for an older link generation returns 409.
// On /{id}/manage, PATCH {name} renames a party and DELETE removes it and its reply. Both accept a host credential.
import { validPartyName } from '../../public/js/guest-list.js';
import { normalizeLang } from '../../public/js/i18n.js';
import { modeOf } from '../../public/js/invite.js';
import { ID_PATTERN, makeReply, newId, PARTY_LIMITS, partyLinkSecret, viewLinkSecret } from '../../public/js/rsvp.js';
import { addCount, bearer, hash, json, matches, ownedEvent, readBody, Refusal } from './shared.js';

const viewRoute = { pattern: /^\/api\/events\/([^/]+)\/parties\/([^/]+)\/view$/, methods: { GET: getView } };

export const routes = [
  viewRoute,
  {
    pattern: /^\/api\/events\/([^/]+)\/parties$/,
    methods: { POST: addParties },
  },
  {
    pattern: /^\/api\/events\/([^/]+)\/parties\/([^/]+)$/,
    methods: { PUT: addParty, GET: getParty, PATCH: saveReply, DELETE: withdrawReply },
  },
  { pattern: /^\/api\/events\/([^/]+)\/parties\/([^/]+)\/link$/, methods: { PATCH: changeLink } },
  {
    pattern: /^\/api\/events\/([^/]+)\/parties\/([^/]+)\/manage$/,
    methods: { PATCH: renameParty, DELETE: deleteParty },
  },
];

async function addParty({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const { name, defaultSeats, lang } = await readBody(request);
  const created = await insertParties(db, eventId, secret, [{ id, name }], defaultSeats, lang);
  return json(created ? 201 : 200, { id });
}

async function addParties({ db, request, ids: [eventId] }) {
  const secret = bearer(request);
  const { entries, defaultSeats, lang } = await readBody(request);
  if (!Array.isArray(entries) || !entries.length) throw new Refusal(400, 'party');
  if (entries.length > PARTY_LIMITS.count) throw new Refusal(429, 'partyLimit');
  const created = await insertParties(db, eventId, secret, entries, defaultSeats, lang);
  return json(created ? 201 : 200, {});
}

async function insertParties(db, eventId, secret, entries, defaultSeats, lang) {
  const parties = new Map();
  for (const entry of entries) {
    const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
    if (typeof entry?.id !== 'string' || !ID_PATTERN.test(entry.id) || parties.has(entry.id))
      throw new Refusal(400, 'id');
    if (!validPartyName(name)) throw new Refusal(400, 'party');
    parties.set(entry.id, name);
  }
  if (!Number.isInteger(defaultSeats) || defaultSeats < 1 || defaultSeats > PARTY_LIMITS.seats)
    throw new Refusal(400, 'party');

  return db.transaction(async (tx) => {
    const event = await ownedEvent(tx, eventId, secret, { token: false });
    if (modeOf(event.d) !== 'guestList') throw new Refusal(403, 'partyMode');
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
    const entries = await Promise.all(
      [...parties].map(async ([id, name]) => {
        const personal = await partyLinkSecret(secret, id, 'personal');
        const view = await viewLinkSecret(personal, id);
        return { id, name, secret_hash: hash(personal), view_hash: hash(view) };
      }),
    );
    const { rows } = await tx.query(
      `insert into parties (id, event_id, name, lang, default_seats, secret_hash, view_hash)
       select id, $1, name, $2, $3, secret_hash, view_hash
       from jsonb_to_recordset($4) as entry(id text, name text, secret_hash text, view_hash text)
       on conflict (id) do nothing returning id`,
      [eventId, normalizeLang(lang), defaultSeats, JSON.stringify(entries)],
    );
    if (rows.length !== parties.size) throw new Refusal(409, 'partyId');
    return true;
  });
}

// Reads a basic party reply from an explicitly selected row. No reply is represented by null.
const replyOf = (row) =>
  row?.reply_version == null
    ? null
    : {
        attending: row.attending,
        partySize: row.party_size,
        note: row.note,
        version: row.reply_version,
      };

const replyColumns = 'r.attending, r.party_size, r.note, r.version as reply_version';

// Reads the authenticated host's parties and prepares older view hashes when the host has the management link.
export async function listParties(db, eventId, managementSecret) {
  const { rows } = await db.query(
    `select p.id, p.name, p.lang, p.default_seats, p.revoked, p.link_generation, p.secret_hash, p.view_hash,
            p.first_opened_at, p.last_opened_at, ${replyColumns} from parties p
     left join responses r on r.party_id = p.id where p.event_id = $1 order by p.created_at, p.id`,
    [eventId],
  );
  if (managementSecret) await preparePreviews(db, eventId, managementSecret, rows);
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    lang: p.lang,
    defaultSeats: p.default_seats,
    revoked: p.revoked,
    linkGeneration: p.link_generation,
    firstOpenedAt: p.first_opened_at ? new Date(p.first_opened_at).toISOString() : null,
    lastOpenedAt: p.last_opened_at ? new Date(p.last_opened_at).toISOString() : null,
    reply: replyOf(p),
  }));
}

async function preparePreviews(db, eventId, managementSecret, parties) {
  const candidates = await Promise.all(
    parties
      .filter((party) => !party.revoked)
      .map(async (party) => {
        const personal = await partyLinkSecret(managementSecret, party.id, 'personal', party.link_generation);
        const viewHash = hash(await viewLinkSecret(personal, party.id));
        if (viewHash === party.view_hash || !matches(personal, party.secret_hash)) return null;
        return { id: party.id, secret_hash: party.secret_hash, previous_hash: party.view_hash, view_hash: viewHash };
      }),
  );
  const changes = candidates.filter(Boolean);
  if (!changes.length) return;
  // An older row can need a view hash before anyone opens its personal link. Leave opened times untouched.
  await db.query(
    `update parties p set view_hash = v.view_hash
     from jsonb_to_recordset($2) as v(id text, secret_hash text, previous_hash text, view_hash text)
     where p.event_id = $1 and p.id = v.id and not p.revoked
       and p.secret_hash = v.secret_hash and p.view_hash = v.previous_hash`,
    [eventId, JSON.stringify(changes)],
  );
}

async function changeLink({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const { action, linkGeneration } = await readBody(request);
  if (
    (action !== 'revoke' && action !== 'regenerate') ||
    (linkGeneration !== null && (typeof linkGeneration !== 'string' || !ID_PATTERN.test(linkGeneration)))
  )
    throw new Refusal(400, 'body');
  return db.transaction(async (tx) => {
    await ownedEvent(tx, eventId, secret, { token: false });
    const {
      rows: [party],
    } = await tx.query('select link_generation from parties where id = $1 and event_id = $2 for update', [id, eventId]);
    if (!party) throw new Refusal(404, 'personalLink');
    if (party.link_generation !== linkGeneration) throw new Refusal(409, 'partyLinkChanged');
    if (action === 'revoke') {
      await tx.query('update parties set revoked = true where id = $1', [id]);
    } else {
      const generation = newId();
      const personal = await partyLinkSecret(secret, id, 'personal', generation);
      const view = await viewLinkSecret(personal, id);
      await tx.query(
        'update parties set revoked = false, link_generation = $2, secret_hash = $3, view_hash = $4 where id = $1',
        [id, generation, hash(personal), hash(view)],
      );
    }
    return json(204, null);
  });
}

function checkPartyLink(party, secret, hashColumn = 'secret_hash') {
  if (!party || party.revoked || !matches(secret, party[hashColumn])) throw new Refusal(404, 'personalLink');
}

async function getView({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const {
    rows: [party],
  } = await db.query(
    `select p.name, p.view_hash, p.revoked, e.t, e.d
     from parties p join events e on e.id = p.event_id where p.id = $1 and p.event_id = $2`,
    [id, eventId],
  );
  checkPartyLink(party, secret, 'view_hash');
  return json(200, { t: party.t, d: party.d, name: party.name });
}

async function renameParty({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const { name } = await readBody(request);
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!validPartyName(trimmed)) throw new Refusal(400, 'partyName');
  return db.transaction(async (tx) => {
    await ownedEvent(tx, eventId, secret);
    const result = await tx.query(
      'update parties set name = $3, updated_at = now() where id = $1 and event_id = $2 returning id',
      [id, eventId, trimmed],
    );
    if (!result.rows.length) throw new Refusal(404, 'partyMissing');
    return json(204, null);
  });
}

async function deleteParty({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  return db.transaction(async (tx) => {
    await ownedEvent(tx, eventId, secret);
    await tx.query('delete from parties where id = $1 and event_id = $2', [id, eventId]);
    return json(204, null);
  });
}

async function getParty({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const {
    rows: [party],
  } = await db.query(
    `select p.name, p.default_seats, p.secret_hash, p.revoked, e.t, e.d, ${replyColumns}
     from parties p join events e on e.id = p.event_id left join responses r on r.party_id = p.id
     where p.id = $1 and p.event_id = $2`,
    [id, eventId],
  );
  checkPartyLink(party, secret);
  const view = await viewLinkSecret(secret, id);
  // Use the current credential so a concurrent revoke or regeneration cannot record a stale open.
  const opened = await db.query(
    `update parties
     set first_opened_at = coalesce(first_opened_at, now()), last_opened_at = greatest(last_opened_at, now()),
         view_hash = $1
     where id = $2 and event_id = $3 and secret_hash = $4 and not revoked returning id`,
    [hash(view), id, eventId, party.secret_hash],
  );
  if (!opened.rows.length) throw new Refusal(404, 'personalLink');
  return json(200, {
    t: party.t,
    d: party.d,
    name: party.name,
    defaultSeats: party.default_seats,
    reply: replyOf(party),
  });
}

// Serializes reply changes through the party row. A fresh read after locking sees the latest reply.
async function ownedPartyReply(tx, eventId, id, secret) {
  // The event is the parent of both rows. Lock it first to keep the order of a concurrent invitation deletion.
  await tx.query('select id from events where id = $1 for key share', [eventId]);
  const {
    rows: [party],
  } = await tx.query(
    'select name, default_seats, secret_hash, revoked, version from parties where id = $1 and event_id = $2 for update',
    [id, eventId],
  );
  checkPartyLink(party, secret);
  const {
    rows: [reply],
  } = await tx.query(`select ${replyColumns} from responses r where party_id = $1`, [id]);
  return { ...party, reply: replyOf(reply) };
}

async function saveReply({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const body = await readBody(request);
  return db.transaction(async (tx) => {
    const party = await ownedPartyReply(tx, eventId, id, secret);
    const { reply } = makeReply({ ...body, name: party.name }, party.default_seats);
    if (!reply) throw new Refusal(400, 'partyReply');
    if (body.version !== party.reply?.version) throw new Refusal(409, 'replyChanged', { reply: party.reply });
    // The party version advances across withdrawals, so a stale form cannot change a replacement reply.
    const version = party.version + 1;
    await tx.query(
      `insert into responses (id, event_id, party_id, name, attending, party_size, note, version)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (party_id) do update set attending = excluded.attending, party_size = excluded.party_size,
       note = excluded.note, version = excluded.version, updated_at = now()`,
      [newId(), eventId, id, reply.name, reply.attending, reply.partySize, reply.note, version],
    );
    await tx.query('update parties set version = $2 where id = $1', [id, version]);
    if (!party.reply) await addCount(tx, 'reply_submit', normalizeLang(body.lang));
    return json(party.reply ? 200 : 201, { version });
  });
}

async function withdrawReply({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const { version } = await readBody(request);
  if (version === undefined) throw new Refusal(400, 'version');
  return db.transaction(async (tx) => {
    const { reply } = await ownedPartyReply(tx, eventId, id, secret);
    if (reply) {
      if (version !== reply.version) throw new Refusal(409, 'replyChanged', { reply });
      await tx.query('delete from responses where party_id = $1', [id]);
    }
    return json(204, null);
  });
}
