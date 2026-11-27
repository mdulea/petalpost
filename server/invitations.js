// Deep published-invitation lifecycle module: lookup, ended-invitation resolution, host and passkey credential
// verification (without exposing secret_hash), editor republish merging, tracker settings updates, and public/host
// payload projection.
import { isValidDate } from '../public/js/countdown.js';
import { normalizeLang } from '../public/js/i18n.js';
import { modeOf } from '../public/js/invite.js';
import { isSeatingPublished } from '../public/js/seating.js';
import { addCount, hash, matches, Refusal, today } from './routes/shared.js';

export const DAILY_EVENTS = 20;

// True when the retention job deleted this guest-list invitation after its event.
export async function isEnded(db, id) {
  return (await db.query('select 1 from ended_events where id = $1', [id])).rows.length > 0;
}

// Resolves a published invitation for HTML/public rendering without throwing: status is 200, 410 (ended) or 404.
export async function findInvitation(db, id) {
  const event = (await db.query('select t, d, version from events where id = $1', [id])).rows[0] ?? null;
  if (event) return { status: 200, event };
  return { status: (await isEnded(db, id)) ? 410 : 404, event: null };
}

// Reads a published invitation row (optionally locked) or throws 410 eventEnded / 404 eventMissing.
/**
 * @param {any} db
 * @param {string} id
 * @param {{ lock?: 'update' | 'key share' | false }} [options]
 */
export async function readInvitation(db, id, options = {}) {
  const { lock = false } = options;
  const event = (await db.query(`select t, d, version from events where id = $1${lock ? ` for ${lock}` : ''}`, [id]))
    .rows[0];
  if (event) return event;
  const ended = await isEnded(db, id);
  throw new Refusal(ended ? 410 : 404, ended ? 'eventEnded' : 'eventMissing');
}

// Verifies the host's management secret or, when token is allowed, a passkey sign-in access token. Returns the
// invitation with auth ('secret' | 'token') and never exposes the stored secret hash to route handlers.
/**
 * @param {any} tx
 * @param {string} id
 * @param {string} credential
 * @param {{ lock?: 'update' | 'key share' | false, token?: boolean }} [options]
 */
export async function verifyHost(tx, id, credential, options = {}) {
  const { lock = 'update', token = true } = options;
  const row = (
    await tx.query(`select secret_hash, version, t, d from events where id = $1${lock ? ` for ${lock}` : ''}`, [id])
  ).rows[0];
  if (!row) {
    const ended = await isEnded(tx, id);
    throw new Refusal(ended ? 410 : 404, ended ? 'eventEnded' : 'eventMissing');
  }
  const event = { id, version: row.version, t: row.t, d: row.d };
  if (matches(credential, row.secret_hash)) return { ...event, auth: 'secret' };
  if (token) {
    const access = (
      await tx.query('select expires_at > now() as live from access_tokens where token_hash = $1 and event_id = $2', [
        hash(credential),
        id,
      ])
    ).rows[0];
    if (access?.live) return { ...event, auth: 'token' };
    if (access) throw new Refusal(401, 'signInExpired');
  }
  throw new Refusal(403, 'eventForbidden');
}

// Keeps the tracker update outside the editor's invitation fields and includes it only on authorized reads.
export function projectInvitation(event, { includeUpdate = false } = {}) {
  const { updateNotice, ...d } = event.d;
  return { t: event.t, d, ...(includeUpdate && updateNotice ? { updateNotice } : {}) };
}

// Merges an editor republish payload with all tracker-managed settings on storedD in one place so editing an
// invitation never erases mode, RSVP deadline, update notice, or published seating state.
export function mergeRepublish(storedD, nextD) {
  return {
    ...nextD,
    mode: modeOf(storedD),
    ...(isValidDate(storedD?.deadline) ? { deadline: storedD.deadline } : {}),
    ...(storedD?.updateNotice ? { updateNotice: storedD.updateNotice } : {}),
    ...(isSeatingPublished(storedD) ? { seatingPublished: true } : {}),
  };
}

// Single interface for tracker-managed settings updates on a locked invitation row:
// - {updateNotice: string | null} keeps version
// - {deadline: string | null} keeps version
// - {seatingPublished: boolean} keeps version
// - {mode: 'open' | 'guestList'} bumps version when the mode changes
export async function updateSettings(tx, id, event, patch) {
  const next = { ...event.d };
  let bumpVersion = false;

  if (Object.hasOwn(patch, 'updateNotice')) {
    if (modeOf(event.d) !== 'guestList') throw new Refusal(403, 'updateMode');
    if (patch.updateNotice) next.updateNotice = patch.updateNotice;
    else delete next.updateNotice;
  }
  if (Object.hasOwn(patch, 'deadline')) {
    if (modeOf(event.d) !== 'guestList') throw new Refusal(403, 'deadlineMode');
    if (patch.deadline) next.deadline = patch.deadline;
    else delete next.deadline;
  }
  if (Object.hasOwn(patch, 'seatingPublished')) {
    if (modeOf(event.d) !== 'guestList') throw new Refusal(403, 'tableMode');
    if (patch.seatingPublished) next.seatingPublished = true;
    else delete next.seatingPublished;
  }
  if (Object.hasOwn(patch, 'mode')) {
    const current = modeOf(event.d);
    if (current === patch.mode) return { mode: patch.mode, version: event.version };
    if (patch.mode === 'guestList' && !event.d.date) throw new Refusal(400, 'guestListDate');
    if (patch.mode === 'open') {
      const hasParty = (await tx.query('select 1 from parties where event_id = $1 limit 1', [id])).rows.length > 0;
      if (hasParty) throw new Refusal(409, 'modeHasParties');
    }
    next.mode = patch.mode;
    bumpVersion = true;
  }

  await tx.query(
    `update events set d = $2::text::jsonb${bumpVersion ? ', version = version + 1' : ''}, updated_at = now() where id = $1`,
    [id, JSON.stringify(next)],
  );
  return {
    ...(Object.hasOwn(patch, 'mode') ? { mode: patch.mode, version: event.version + (bumpVersion ? 1 : 0) } : {}),
    ...(Object.hasOwn(patch, 'deadline') ? { deadline: patch.deadline } : {}),
    ...(Object.hasOwn(patch, 'seatingPublished') ? { published: patch.seatingPublished } : {}),
  };
}

// Creates, replays, or republishes an invitation under the host's management secret.
export function putInvitation(db, { id, secret, record, version, ip, dailyEvents, lang }) {
  return db.transaction(async (tx) => {
    const exists = (await tx.query('select 1 from events where id = $1', [id])).rows.length > 0;
    if (exists) {
      const event = await verifyHost(tx, id, secret);
      if (version === undefined) return { status: 200, body: { version: event.version, created: false } };
      if (version !== event.version) {
        throw new Refusal(409, 'eventChanged', { ...projectInvitation(event), version: event.version });
      }
      if (modeOf(event.d) === 'guestList' && !record.d.date) throw new Refusal(400, 'guestListDate');
      const next = mergeRepublish(event.d, record.d);
      await tx.query(
        'update events set t = $2, d = $3::text::jsonb, version = version + 1, updated_at = now() where id = $1',
        [id, record.t, JSON.stringify(next)],
      );
      return { status: 200, body: { version: event.version + 1, created: false } };
    }
    if (await isEnded(tx, id)) throw new Refusal(410, 'eventEnded');
    if (version !== undefined) throw new Refusal(404, 'eventMissing');
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
    await addCount(tx, 'invitation_publish', normalizeLang(lang));
    return { status: 201, body: { version: 1, created: true } };
  });
}

// Deletes an invitation and all cascading rows after verifying a host credential.
export function deleteInvitation(db, id, secret) {
  return db.transaction(async (tx) => {
    await verifyHost(tx, id, secret);
    await tx.query('delete from events where id = $1', [id]);
  });
}
