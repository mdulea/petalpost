// The reply routes of server/api.js:
//
// GET /api/events/{id}/responses                host credential; {t, d, version, responses, totals, parties?,
//                                               tables?, updateNotice?}
// PUT /api/events/{id}/responses/{rid}          edit secret; {name, attending, partySize, answers?, meals?, note?,
//                                               version?, lang?}
// GET /api/events/{id}/responses/{rid}          edit secret; {name, attending, partySize, answers?, meals?, note,
//                                               version}
// DELETE /api/events/{id}/responses/{rid}       edit secret; {version} withdraws the reply; 204, also when it is gone
// POST /api/events/{id}/responses/{rid}/attach  management secret; {partyId} attaches an earlier reply to a party; 204
//
// A PUT without version creates the reply: 201 {version: 1, created: true}, or 200 {version, created: false}
// unchanged when it already exists with the same secret. A PUT with version updates: 200 {version, created: false},
// or 409 with the error and the current reply with its version when the version is stale.
// A reply created without note has an empty note, and a reply updated without note keeps its stored note. A new
// reply counts reply_submit under the body's lang normalized to en or ro. An event takes at most EVENT_RESPONSES
// replies; the 429 stores nothing, and existing replies stay editable. Updates, replays, withdrawals and refusals
// count nothing. A guest-list invitation takes no reply through its invitation link, so every PUT to it gets a 403
// that stores nothing.
// A reply to an invitation with sub-events answers each sub-event, as makeReply in public/js/rsvp.js describes, and a
// reply that misses one gets a 400. Each reply in the management read carries its stored answers, which may lack a
// sub-event that the host added after the reply was saved.
// An attending reply to an invitation with menu options gives a meal count for each option, and the counts add up to
// its party size, as makeReply describes; other counts get a 400. Each read of a reply carries its stored meal counts.
import { normalizeLang } from '../../public/js/i18n.js';
import { menuOptionIds, modeOf, subEventIds } from '../../public/js/invite.js';
import { answersOf, ID_PATTERN, makeReply, mealsOf, storedAnswers, storedMeals, tally } from '../../public/js/rsvp.js';
import { tableSeats } from '../../public/js/seating.js';
import { presentationOf } from './events.js';
import { listParties } from './parties.js';
import { listTables } from './seating.js';
import { addCount, bearer, hash, json, matches, ownedEvent, readBody, Refusal } from './shared.js';

export const EVENT_RESPONSES = 200;

export const routes = [
  { pattern: /^\/api\/events\/([^/]+)\/responses$/, methods: { GET: listResponses } },
  {
    pattern: /^\/api\/events\/([^/]+)\/responses\/([^/]+)$/,
    methods: { GET: getReply, PUT: putReply, DELETE: withdrawReply },
  },
  { pattern: /^\/api\/events\/([^/]+)\/responses\/([^/]+)\/attach$/, methods: { POST: attachReply } },
];

// Read from one snapshot without locking the event, so a concurrently attached reply appears exactly once.
// Only older view hashes may need an update.
async function listResponses({ db, request, ids: [id] }) {
  const secret = bearer(request);
  return db.transaction(async (tx) => {
    await tx.query('set transaction isolation level repeatable read');
    return readResponses(tx, id, secret);
  });
}

async function readResponses(tx, id, secret) {
  const event = await ownedEvent(tx, id, secret, { lock: false });
  const hasGuestList = modeOf(event.d) === 'guestList';
  const { rows } = await tx.query(
    `select id, name, attending, party_size, answers, meals, note, created_at, updated_at from responses
     where event_id = $1${hasGuestList ? ' and party_id is null' : ''} order by created_at, updated_at`,
    [id],
  );
  const responses = rows.map((r) => ({
    ...(hasGuestList ? { id: r.id } : {}),
    name: r.name,
    attending: r.attending,
    partySize: r.party_size,
    ...answersOf(r.answers),
    ...mealsOf(r.meals),
    note: r.note,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
  const managementSecret = matches(secret, event.secret_hash) ? secret : undefined;
  const parties = hasGuestList ? await listParties(tx, id, managementSecret) : undefined;
  const tables = hasGuestList ? tableSeats(await listTables(tx, id), parties) : undefined;
  return json(200, {
    ...presentationOf(event, true),
    version: event.version,
    responses,
    totals: tally(responses),
    parties,
    tables,
  });
}

// The response row, locked for the transaction, after checking that it belongs to the event and that the edit
// secret matches; null when no response has that id.
async function ownedReply(tx, eventId, id, secret) {
  const reply = (
    await tx.query(
      'select event_id, secret_hash, name, attending, party_size, answers, meals, note, version from responses where id = $1 and secret_hash is not null for update',
      [id],
    )
  ).rows[0];
  if (!reply) return null;
  if (reply.event_id !== eventId || !matches(secret, reply.secret_hash)) {
    throw new Refusal(403, 'replyForbidden');
  }
  return reply;
}

const replyOf = (row) => ({
  name: row.name,
  attending: row.attending,
  partySize: row.party_size,
  ...answersOf(row.answers),
  ...mealsOf(row.meals),
  note: row.note,
});

async function getReply({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  return db.transaction(async (tx) => {
    const event = (await tx.query('select d from events where id = $1', [eventId])).rows[0];
    if (!event) throw new Refusal(404, 'eventMissing');
    if (modeOf(event.d) === 'guestList') throw new Refusal(404, 'replyLinkUnavailable');
    const reply = await ownedReply(tx, eventId, id, secret);
    if (!reply) throw new Refusal(404, 'replyMissing');
    return json(200, { ...replyOf(reply), version: reply.version });
  });
}

async function putReply({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const body = await readBody(request);
  return db.transaction(async (tx) => {
    // The event row lock serializes the count and insert below across concurrent replies to one event.
    const event = (await tx.query('select d from events where id = $1 for update', [eventId])).rows[0];
    if (!event) throw new Refusal(404, 'eventMissing');
    if (modeOf(event.d) === 'guestList') throw new Refusal(403, 'guestListReply');
    const { reply } = makeReply(body, { subEventIds: subEventIds(event.d), menuIds: menuOptionIds(event.d) });
    if (!reply) throw new Refusal(400, 'reply');
    const answers = storedAnswers(reply);
    const meals = storedMeals(reply);
    const existing = await ownedReply(tx, eventId, id, secret);
    if (existing) {
      if (body.version === undefined) return json(200, { version: existing.version, created: false });
      if (body.version !== existing.version) {
        throw new Refusal(409, 'replyChanged', { version: existing.version, ...replyOf(existing) });
      }
      await tx.query(
        `update responses set name = $2, attending = $3, party_size = $4, note = $5, answers = $6, meals = $7,
         version = version + 1, updated_at = now() where id = $1`,
        // A page loaded before replies had notes sends none, so an update without the field keeps the stored note.
        [
          id,
          reply.name,
          reply.attending,
          reply.partySize,
          body.note === undefined ? existing.note : reply.note,
          answers,
          meals,
        ],
      );
      return json(200, { version: existing.version + 1, created: false });
    }
    if (body.version !== undefined) throw new Refusal(404, 'replyMissing');
    const { count } = (await tx.query('select count(*)::int as count from responses where event_id = $1', [eventId]))
      .rows[0];
    if (count >= EVENT_RESPONSES) throw new Refusal(429, 'eventFull');
    await tx.query(
      `insert into responses (id, event_id, secret_hash, name, attending, party_size, answers, meals, note)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [id, eventId, hash(secret), reply.name, reply.attending, reply.partySize, answers, meals, reply.note],
    );
    await addCount(tx, 'reply_submit', normalizeLang(body.lang));
    return json(201, { version: 1, created: true });
  });
}

// A withdrawal leaves no trace of the reply. A repeat after a lost confirmation finds no reply and also succeeds.
async function withdrawReply({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const body = await readBody(request);
  if (body.version === undefined) throw new Refusal(400, 'version');
  return db.transaction(async (tx) => {
    // The same event row lock as putReply, so a withdrawal and a new reply to one event take turns.
    const event = (await tx.query('select d from events where id = $1 for update', [eventId])).rows[0];
    if (!event) throw new Refusal(404, 'eventMissing');
    if (modeOf(event.d) === 'guestList') throw new Refusal(403, 'guestListReply');
    const existing = await ownedReply(tx, eventId, id, secret);
    if (!existing) return json(204, null);
    if (body.version !== existing.version) {
      throw new Refusal(409, 'replyChanged', { version: existing.version, ...replyOf(existing) });
    }
    await tx.query('delete from responses where id = $1', [id]);
    return json(204, null);
  });
}

// Attaches an earlier unattached reply to a party that has no reply and clears its reply edit link secret hash.
async function attachReply({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const { partyId } = await readBody(request);
  if (typeof partyId !== 'string' || !ID_PATTERN.test(partyId)) throw new Refusal(400, 'body');
  return db.transaction(async (tx) => {
    const event = await ownedEvent(tx, eventId, secret, { token: false });
    if (modeOf(event.d) !== 'guestList') throw new Refusal(403, 'partyMode');
    const party = (
      await tx.query('select id, version from parties where id = $1 and event_id = $2 for update', [partyId, eventId])
    ).rows[0];
    if (!party) throw new Refusal(404, 'partyMissing');
    const reply = (
      await tx.query('select id, party_id from responses where id = $1 and event_id = $2 for update', [id, eventId])
    ).rows[0];
    if (!reply) throw new Refusal(404, 'replyMissing');
    if (reply.party_id === partyId) return json(204, null);
    if (reply.party_id !== null) throw new Refusal(409, 'replyAttached');
    const existing = (await tx.query('select 1 from responses where party_id = $1 limit 1', [partyId])).rows.length > 0;
    if (existing) throw new Refusal(409, 'partyHasReply');
    const version = party.version + 1;
    await tx.query(
      'update responses set party_id = $2, secret_hash = null, version = $3, updated_at = now() where id = $1',
      [id, partyId, version],
    );
    await tx.query('update parties set version = $2 where id = $1', [partyId, version]);
    return json(204, null);
  });
}
