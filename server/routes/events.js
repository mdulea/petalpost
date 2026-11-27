// The invitation routes of server/api.js:
//
// PUT /api/events/{id}                     management secret; {t, d, version?, lang?} creates, replays or updates
// GET /api/events/{id}                     public; {t, d}
// PATCH /api/events/{id}                   host credential; {updateNotice} sets or removes the latest update; 204
// DELETE /api/events/{id}                  management secret; removes the event and its responses; 204
// PATCH /api/events/{id}/deadline management secret; {deadline} sets, changes or clears (null) the RSVP deadline PATCH
// /api/events/{id}/mode management secret; {mode} switches mode; 400 without a date for the
//                                          guest-list mode; 409 when parties block the open mode
//
// A PUT without version creates the event: 201 {version: 1, created: true}, or 200 {version, created: false}
// unchanged when it already exists with the same secret. A PUT with version updates: 200 {version, created: false},
// or 409 with the error and the current {version, t, d} when the version is stale. The mode in d is set when the
// event is created, and an update keeps the stored mode, deadline and published seating plan whatever the body sends,
// so a page loaded before invitations had modes cannot open a guest-list invitation to replies or clear its settings.
// A new event counts invitation_publish under the body's lang normalized to en or ro; updates, replays and refusals
// count nothing. Each client IP may create dailyEvents events per UTC day, DAILY_EVENTS unless createApi sets
// another number; the 429 stores nothing.
import { isValidDate } from '../../public/js/countdown.js';
import { normalizeLang } from '../../public/js/i18n.js';
import { MODES, modeOf, readPublished, UPDATE_NOTICE_LIMIT } from '../../public/js/invite.js';
import { isSeatingPublished } from '../../public/js/seating.js';
import { addCount, bearer, hash, isEnded, json, ownedEvent, readBody, Refusal, today } from './shared.js';

export const DAILY_EVENTS = 20;

export const routes = [
  {
    pattern: /^\/api\/events\/([^/]+)$/,
    methods: { GET: getEvent, PUT: putEvent, PATCH: saveUpdate, DELETE: deleteEvent },
  },
  { pattern: /^\/api\/events\/([^/]+)\/deadline$/, methods: { PATCH: setDeadline } },
  { pattern: /^\/api\/events\/([^/]+)\/mode$/, methods: { PATCH: switchMode } },
];

// Keep the tracker update outside the editor's invitation fields and include it only on authorized reads.
export function presentationOf(event, includeUpdate = false) {
  const { updateNotice, ...d } = event.d;
  return { t: event.t, d, ...(includeUpdate && updateNotice ? { updateNotice } : {}) };
}

async function getEvent({ db, ids: [id] }) {
  const event = (await db.query('select t, d from events where id = $1', [id])).rows[0];
  if (!event) {
    if (await isEnded(db, id)) throw new Refusal(410, 'eventEnded');
    throw new Refusal(404, 'eventMissing');
  }
  return json(200, presentationOf(event));
}

async function putEvent({ db, request, ids: [id], dailyEvents }) {
  const secret = bearer(request);
  const body = await readBody(request);
  const record = readPublished(body);
  if (!record) throw new Refusal(400, 'invite');
  const ip = request.headers.get('x-real-ip') || 'unknown';
  return db.transaction(async (tx) => {
    const exists = (await tx.query('select 1 from events where id = $1', [id])).rows.length > 0;
    if (exists) {
      const event = await ownedEvent(tx, id, secret);
      if (body.version === undefined) return json(200, { version: event.version, created: false });
      if (body.version !== event.version) {
        throw new Refusal(409, 'eventChanged', { ...presentationOf(event), version: event.version });
      }
      const mode = modeOf(event.d);
      if (mode === 'guestList' && !record.d.date) throw new Refusal(400, 'guestListDate');
      const next = {
        ...record.d,
        mode,
        ...(isValidDate(event.d?.deadline) ? { deadline: event.d.deadline } : {}),
        updateNotice: event.d.updateNotice,
        ...(isSeatingPublished(event.d) ? { seatingPublished: true } : {}),
      };
      await tx.query(
        'update events set t = $2, d = $3::text::jsonb, version = version + 1, updated_at = now() where id = $1',
        [id, record.t, JSON.stringify(next)],
      );
      return json(200, { version: event.version + 1, created: false });
    }
    if (await isEnded(tx, id)) throw new Refusal(410, 'eventEnded');
    if (body.version !== undefined) throw new Refusal(404, 'eventMissing');
    if (record.d.mode === 'guestList' && !record.d.date) throw new Refusal(400, 'guestListDate');
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

async function saveUpdate({ db, request, ids: [id] }) {
  const secret = bearer(request);
  const { updateNotice } = await readBody(request);
  const text = typeof updateNotice === 'string' ? updateNotice.trim() : '';
  if (
    updateNotice !== null &&
    (!text || text.length > UPDATE_NOTICE_LIMIT || !text.isWellFormed() || text.includes('\0'))
  ) {
    throw new Refusal(400, 'updateNotice');
  }
  return db.transaction(async (tx) => {
    const event = await ownedEvent(tx, id, secret);
    if (modeOf(event.d) !== 'guestList') throw new Refusal(403, 'updateMode');
    // The editor and tracker lock the same row, but the update leaves the invitation version alone. Like the other
    // host writes, it moves updated_at.
    const d = { ...event.d, updateNotice: text || undefined };
    await tx.query('update events set d = $2::text::jsonb, updated_at = now() where id = $1', [id, JSON.stringify(d)]);
    return json(204, null);
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

async function setDeadline({ db, request, ids: [id] }) {
  const secret = bearer(request);
  const { deadline } = await readBody(request);
  const normalized = deadline === null || deadline === '' ? null : deadline;
  if (normalized !== null && !isValidDate(normalized)) throw new Refusal(400, 'deadline');
  return db.transaction(async (tx) => {
    const event = await ownedEvent(tx, id, secret, { token: false });
    if (modeOf(event.d) !== 'guestList') throw new Refusal(403, 'deadlineMode');
    const next = { ...event.d };
    if (normalized) next.deadline = normalized;
    else delete next.deadline;
    await tx.query('update events set d = $2::text::jsonb, updated_at = now() where id = $1', [
      id,
      JSON.stringify(next),
    ]);
    return json(200, { deadline: normalized });
  });
}

async function switchMode({ db, request, ids: [id] }) {
  const secret = bearer(request);
  const { mode } = await readBody(request);
  if (!MODES.includes(mode)) throw new Refusal(400, 'body');
  return db.transaction(async (tx) => {
    const event = await ownedEvent(tx, id, secret, { token: false });
    const current = modeOf(event.d);
    if (current === mode) return json(200, { mode, version: event.version });
    if (mode === 'guestList' && !event.d.date) throw new Refusal(400, 'guestListDate');
    if (mode === 'open') {
      const hasParty = (await tx.query('select 1 from parties where event_id = $1 limit 1', [id])).rows.length > 0;
      if (hasParty) throw new Refusal(409, 'modeHasParties');
    }
    await tx.query('update events set d = $2::text::jsonb, version = version + 1, updated_at = now() where id = $1', [
      id,
      JSON.stringify({ ...event.d, mode }),
    ]);
    return json(200, { mode, version: event.version + 1 });
  });
}
