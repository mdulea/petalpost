// The invitation routes of server/api.js:
//
// PUT /api/events/{id}                     management secret; {t, d, version?, lang?} creates, replays or updates
// GET /api/events/{id}                     public; {t, d}
// DELETE /api/events/{id}                  management secret; removes the event and its responses; 204
//
// A PUT without version creates the event: 201 {version: 1, created: true}, or 200 {version, created: false}
// unchanged when it already exists with the same secret. A PUT with version updates: 200 {version, created: false},
// or 409 with the error and the current {version, t, d} when the version is stale. The mode in d is set when the
// event is created, and an update keeps the stored mode whatever the body sends, so a page loaded before invitations
// had modes cannot open a guest-list invitation to replies.
// A new event counts invitation_publish under the body's lang normalized to en or ro; updates, replays and refusals
// count nothing. Each client IP may create dailyEvents events per UTC day, DAILY_EVENTS unless createApi sets
// another number; the 429 stores nothing.
import { normalizeLang } from '../../public/js/i18n.js';
import { modeOf, readPublished } from '../../public/js/invite.js';
import { addCount, bearer, hash, json, ownedEvent, readBody, Refusal, today } from './shared.js';

export const DAILY_EVENTS = 20;

export const routes = [
  { pattern: /^\/api\/events\/([^/]+)$/, methods: { GET: getEvent, PUT: putEvent, DELETE: deleteEvent } },
];

async function getEvent({ db, ids: [id] }) {
  const event = (await db.query('select t, d from events where id = $1', [id])).rows[0];
  if (!event) throw new Refusal(404, 'eventMissing');
  return json(200, { t: event.t, d: event.d });
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
        [id, record.t, JSON.stringify({ ...record.d, mode: modeOf(event.d) })],
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
    await addCount(tx, 'invitation_publish', normalizeLang(body.lang));
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
