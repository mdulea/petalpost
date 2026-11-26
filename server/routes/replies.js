// The reply routes of server/api.js:
//
// GET /api/events/{id}/responses           management secret; {t, d, version, responses, totals}
// PUT /api/events/{id}/responses/{rid}     edit secret; {name, attending, partySize, note?, version?, lang?}
// GET /api/events/{id}/responses/{rid}     edit secret; {name, attending, partySize, note, version}
// DELETE /api/events/{id}/responses/{rid}  edit secret; {version} withdraws the reply; 204, also when it is gone
//
// A PUT without version creates the reply: 201 {version: 1, created: true}, or 200 {version, created: false}
// unchanged when it already exists with the same secret. A PUT with version updates: 200 {version, created: false},
// or 409 with the error and the current reply with its version when the version is stale.
// A reply created without note has an empty note, and a reply updated without note keeps its stored note. A new
// reply counts reply_submit under the body's lang normalized to en or ro. An event takes at most EVENT_RESPONSES
// replies; the 429 stores nothing, and existing replies stay editable. Updates, replays, withdrawals and refusals
// count nothing.
import { normalizeLang } from '../../public/js/i18n.js';
import { makeReply, tally } from '../../public/js/rsvp.js';
import { addCount, bearer, hash, json, matches, ownedEvent, readBody, Refusal } from './shared.js';

export const EVENT_RESPONSES = 200;

export const routes = [
  { pattern: /^\/api\/events\/([^/]+)\/responses$/, methods: { GET: listResponses } },
  {
    pattern: /^\/api\/events\/([^/]+)\/responses\/([^/]+)$/,
    methods: { GET: getReply, PUT: putReply, DELETE: withdrawReply },
  },
];

// A read without a lock, so a host refreshing the list never makes guest replies wait.
async function listResponses({ db, request, ids: [id] }) {
  const secret = bearer(request);
  const event = await ownedEvent(db, id, secret, { lock: false });
  const { rows } = await db.query(
    `select name, attending, party_size, note, created_at, updated_at from responses
     where event_id = $1 order by created_at, updated_at`,
    [id],
  );
  const responses = rows.map((r) => ({
    name: r.name,
    attending: r.attending,
    partySize: r.party_size,
    note: r.note,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
  }));
  return json(200, { t: event.t, d: event.d, version: event.version, responses, totals: tally(responses) });
}

// The response row, locked for the transaction, after checking that it belongs to the event and that the edit
// secret matches; null when no response has that id.
async function ownedReply(tx, eventId, id, secret) {
  const reply = (
    await tx.query(
      'select event_id, secret_hash, name, attending, party_size, note, version from responses where id = $1 for update',
      [id],
    )
  ).rows[0];
  if (!reply) return null;
  if (reply.event_id !== eventId || !matches(secret, reply.secret_hash)) {
    throw new Refusal(403, 'replyForbidden');
  }
  return reply;
}

const replyOf = (row) => ({ name: row.name, attending: row.attending, partySize: row.party_size, note: row.note });

async function getReply({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  return db.transaction(async (tx) => {
    const event = (await tx.query('select 1 from events where id = $1', [eventId])).rows[0];
    if (!event) throw new Refusal(404, 'eventMissing');
    const reply = await ownedReply(tx, eventId, id, secret);
    if (!reply) throw new Refusal(404, 'replyMissing');
    return json(200, { ...replyOf(reply), version: reply.version });
  });
}

async function putReply({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const body = await readBody(request);
  const { reply } = makeReply(body);
  if (!reply) throw new Refusal(400, 'reply');
  return db.transaction(async (tx) => {
    // The event row lock serializes the count and insert below across concurrent replies to one event.
    const event = (await tx.query('select 1 from events where id = $1 for update', [eventId])).rows[0];
    if (!event) throw new Refusal(404, 'eventMissing');
    const existing = await ownedReply(tx, eventId, id, secret);
    if (existing) {
      if (body.version === undefined) return json(200, { version: existing.version, created: false });
      if (body.version !== existing.version) {
        throw new Refusal(409, 'replyChanged', { version: existing.version, ...replyOf(existing) });
      }
      await tx.query(
        `update responses set name = $2, attending = $3, party_size = $4, note = $5, version = version + 1,
         updated_at = now() where id = $1`,
        // A page loaded before replies had notes sends none, so an update without the field keeps the stored note.
        [id, reply.name, reply.attending, reply.partySize, body.note === undefined ? existing.note : reply.note],
      );
      return json(200, { version: existing.version + 1, created: false });
    }
    if (body.version !== undefined) throw new Refusal(404, 'replyMissing');
    const { count } = (await tx.query('select count(*)::int as count from responses where event_id = $1', [eventId]))
      .rows[0];
    if (count >= EVENT_RESPONSES) throw new Refusal(429, 'eventFull');
    await tx.query(
      `insert into responses (id, event_id, secret_hash, name, attending, party_size, note)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [id, eventId, hash(secret), reply.name, reply.attending, reply.partySize, reply.note],
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
    const event = (await tx.query('select 1 from events where id = $1 for update', [eventId])).rows[0];
    if (!event) throw new Refusal(404, 'eventMissing');
    const existing = await ownedReply(tx, eventId, id, secret);
    if (!existing) return json(204, null);
    if (body.version !== existing.version) {
      throw new Refusal(409, 'replyChanged', { version: existing.version, ...replyOf(existing) });
    }
    await tx.query('delete from responses where id = $1', [id]);
    return json(204, null);
  });
}
