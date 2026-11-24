// The RSVP API: createApi(db) returns a handler from a Fetch API Request to a Response for every /api path.
// It owns routing, body parsing, validation, authorization, persistence and error mapping; db has the Database
// shape of server/postgres.js. Bodies are JSON, every response has cache-control: no-store, and every error
// body is {error: message} with a message the page can show. Secrets arrive as Authorization: Bearer <secret>;
// the database keeps only their sha256 hex hashes, and no response or log line contains a secret, hash or SQL.
//
// PUT /api/events/{id}                     management secret; {t, d, version?} creates, replays or updates
// GET /api/events/{id}                     public; {t, d}
// DELETE /api/events/{id}                  management secret; removes the event and its responses
// GET /api/events/{id}/responses           management secret; {t, d, version, responses, totals}
// PUT /api/events/{id}/responses/{rid}     edit secret; {name, attending, partySize, note?, version?}
// GET /api/events/{id}/responses/{rid}     edit secret; {name, attending, partySize, note, version}
// DELETE /api/events/{id}/responses/{rid}  edit secret; {version} withdraws the reply; 204, also when it is gone
// GET /api/retention                       public; deletes expired events and their responses; {deleted}
//
// An event expires RETENTION_DAYS days after the later of its event date and its last change; an event without a
// date counts only from its last change. Vercel Cron calls /api/retention daily (vercel.json). The route takes no
// secret, because it deletes only what the next scheduled run deletes and repeating it changes nothing.
//
// A PUT without version creates the record: 201 {version: 1, created: true}, or 200 {version, created: false}
// unchanged when it already exists with the same secret. A PUT with version updates: 200 {version, created: false},
// or 409 with the error and the current record when the version is stale.
import { createHash, timingSafeEqual } from 'node:crypto';
import { apiMessages, normalizeLang } from '../public/js/i18n.js';
import { readPublished } from '../public/js/invite.js';
import { ID_PATTERN, makeReply, REPLY_LIMITS, SECRET_PATTERN, tally } from '../public/js/rsvp.js';

const RETENTION_DAYS = 90;
const DAILY_EVENTS = 20;
const EVENT_RESPONSES = 200;
const MAX_BODY = 8 * 1024;

const LIMITS = {
  replyNameLimit: REPLY_LIMITS.name,
  partySizeLimit: REPLY_LIMITS.partySize,
  replyNoteLimit: REPLY_LIMITS.note,
  dailyEvents: DAILY_EVENTS,
  eventResponses: EVENT_RESPONSES,
};
const MESSAGES = {
  en: apiMessages('en', LIMITS),
  ro: apiMessages('ro', LIMITS),
};

const requestMessages = (request) => MESSAGES[normalizeLang(request.headers.get('accept-language') ?? 'en')];

const ROUTES = [
  { pattern: /^\/api\/retention$/, methods: { GET: deleteExpired } },
  { pattern: /^\/api\/events\/([^/]+)$/, methods: { GET: getEvent, PUT: putEvent, DELETE: deleteEvent } },
  { pattern: /^\/api\/events\/([^/]+)\/responses$/, methods: { GET: listResponses } },
  {
    pattern: /^\/api\/events\/([^/]+)\/responses\/([^/]+)$/,
    methods: { GET: getReply, PUT: putReply, DELETE: withdrawReply },
  },
];

// A thrown Refusal becomes its error response, and rolls back the transaction it leaves.
class Refusal extends Error {
  constructor(status, code, extra = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const json = (status, body) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const hash = (text) => createHash('sha256').update(text).digest('hex');
const matches = (secret, secretHash) => timingSafeEqual(Buffer.from(hash(secret)), Buffer.from(secretHash));
const isVersion = (v) => Number.isInteger(v) && v > 0;
const today = "(now() at time zone 'utc')::date";

export function createApi(db, { dailyEvents = DAILY_EVENTS } = {}) {
  return async function handle(request) {
    const { pathname } = new URL(request.url);
    const messages = requestMessages(request);
    try {
      const route = ROUTES.find((r) => r.pattern.test(pathname));
      if (!route) throw new Refusal(404, 'path');
      const action = route.methods[request.method];
      if (!action) throw new Refusal(405, 'method');
      const ids = pathname.match(route.pattern).slice(1);
      if (!ids.every((id) => ID_PATTERN.test(id))) throw new Refusal(400, 'id');
      return await action({ db, request, ids, dailyEvents });
    } catch (error) {
      if (error instanceof Refusal) return json(error.status, { error: messages[error.code], ...error.extra });
      console.error('rsvp storage error', error?.code ?? 'unknown');
      return json(503, { error: messages.storage });
    }
  };
}

// The Bearer secret, or a 401 Refusal when it is missing or malformed.
function bearer(request) {
  const secret = (request.headers.get('authorization') || '').match(/^Bearer (\S+)$/)?.[1];
  if (!secret || !SECRET_PATTERN.test(secret)) throw new Refusal(401, 'unauthorized');
  return secret;
}

// The JSON object body with a valid optional version, or a 413 or 400 Refusal.
async function readBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw new Refusal(413, 'tooLarge');
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_BODY) throw new Refusal(413, 'tooLarge');
  let body;
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Refusal(400, 'body');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Refusal(400, 'body');
  if (body.version !== undefined && !isVersion(body.version)) throw new Refusal(400, 'version');
  return body;
}

// The event row after checking the management secret. With lock, the row stays locked until the transaction ends.
async function ownedEvent(tx, id, secret, { lock = true } = {}) {
  const event = (
    await tx.query(`select secret_hash, version, t, d from events where id = $1${lock ? ' for update' : ''}`, [id])
  ).rows[0];
  if (!event) throw new Refusal(404, 'eventMissing');
  if (!matches(secret, event.secret_hash)) throw new Refusal(403, 'eventForbidden');
  return event;
}

async function getEvent({ db, ids: [id] }) {
  const event = (await db.query('select t, d from events where id = $1', [id])).rows[0];
  if (!event) throw new Refusal(404, 'eventMissing');
  return json(200, { t: event.t, d: event.d });
}

async function deleteExpired({ db }) {
  const { rows } = await db.query(
    `delete from events
     where greatest(nullif(d->>'date', '')::date, (updated_at at time zone 'utc')::date) < ${today} - $1::int
     returning 1`,
    [RETENTION_DAYS],
  );
  return json(200, { deleted: rows.length });
}

async function putEvent({ db, request, ids: [id], dailyEvents }) {
  const secret = bearer(request);
  const body = await readBody(request);
  const record = readPublished(body);
  if (!record) throw new Refusal(400, 'invite');
  const ip = request.headers.get('x-real-ip') || 'unknown';
  return db.transaction(async (tx) => {
    const exists = (await tx.query('select 1 from events where id = $1', [id])).rows.length > 0;
    if (!exists && body.version !== undefined) throw new Refusal(404, 'eventMissing');
    if (exists) {
      const event = await ownedEvent(tx, id, secret);
      if (body.version === undefined) return json(200, { version: event.version, created: false });
      if (body.version !== event.version) {
        throw new Refusal(409, 'eventChanged', { version: event.version, t: event.t, d: event.d });
      }
      await tx.query(
        'update events set t = $2, d = $3::text::jsonb, version = version + 1, updated_at = now() where id = $1',
        [id, record.t, JSON.stringify(record.d)],
      );
      return json(200, { version: event.version + 1, created: false });
    }
    // The counter keys on a hash of today's random salt and the IP; deleting earlier salts makes old keys unusable.
    await tx.query(`delete from creation_quota where day < ${today}`, []);
    await tx.query(`delete from quota_salts where day < ${today}`, []);
    await tx.query(`insert into quota_salts (day) values (${today}) on conflict (day) do nothing`, []);
    const { count } = (
      await tx.query(
        `insert into creation_quota (client, day, count)
         select encode(sha256(convert_to(salt || $1, 'UTF8')), 'hex'), day, 1 from quota_salts where day = ${today}
         on conflict (client, day) do update set count = creation_quota.count + 1 returning count`,
        [ip],
      )
    ).rows[0];
    if (count > dailyEvents) throw new Refusal(429, 'dailyEvents');
    await tx.query('insert into events (id, secret_hash, t, d) values ($1, $2, $3, $4::text::jsonb)', [
      id,
      hash(secret),
      record.t,
      JSON.stringify(record.d),
    ]);
    return json(201, { version: 1, created: true });
  });
}

async function deleteEvent({ db, request, ids: [id] }) {
  const secret = bearer(request);
  return db.transaction(async (tx) => {
    await ownedEvent(tx, id, secret);
    await tx.query('delete from events where id = $1', [id]);
    return json(204, null);
  });
}

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
        [id, reply.name, reply.attending, reply.partySize, reply.note],
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
