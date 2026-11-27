// The invitation routes of server/api.js:
//
// PUT /api/events/{id}                     management secret; {t, d, version?, lang?} creates, replays or updates
// GET /api/events/{id}                     public; {t, d}
// PATCH /api/events/{id}                   host credential; {updateNotice} sets or removes the latest update; 204
// DELETE /api/events/{id}                  host credential; removes the event and its responses; 204
// PATCH /api/events/{id}/deadline          management secret; {deadline} sets, changes or clears (null) the RSVP
//                                          deadline
// PATCH /api/events/{id}/mode              management secret; {mode} switches mode; 400 without a date for the
//                                          guest-list mode; 409 when parties block the open mode
import { isValidDate } from '../../public/js/countdown.js';
import { MODES, readPublished, validateUpdateNotice } from '../../public/js/invite.js';
import {
  deleteInvitation,
  projectInvitation,
  putInvitation,
  readInvitation,
  updateSettings,
  verifyHost,
} from '../invitations.js';
import { bearer, json, readBody, Refusal } from './shared.js';

export const routes = [
  {
    pattern: /^\/api\/events\/([^/]+)$/,
    methods: { GET: getEvent, PUT: putEvent, PATCH: saveUpdate, DELETE: deleteEvent },
  },
  { pattern: /^\/api\/events\/([^/]+)\/deadline$/, methods: { PATCH: setDeadline } },
  { pattern: /^\/api\/events\/([^/]+)\/mode$/, methods: { PATCH: switchMode } },
];

async function getEvent({ db, ids: [id] }) {
  const event = await readInvitation(db, id);
  return json(200, projectInvitation(event));
}

async function putEvent({ db, request, ids: [id], dailyEvents }) {
  const secret = bearer(request);
  const body = await readBody(request);
  const record = readPublished(body);
  if (!record) throw new Refusal(400, 'invite');
  const ip = request.headers.get('x-real-ip') || 'unknown';
  const result = await putInvitation(db, {
    id,
    secret,
    record,
    version: body.version,
    ip,
    dailyEvents,
    lang: body.lang,
  });
  return json(result.status, result.body);
}

async function saveUpdate({ db, request, ids: [id] }) {
  const secret = bearer(request);
  const { updateNotice } = await readBody(request);
  const checked = validateUpdateNotice(updateNotice);
  if (!checked.ok) throw new Refusal(400, 'updateNotice');
  return db.transaction(async (tx) => {
    const event = await verifyHost(tx, id, secret);
    await updateSettings(tx, id, event, { updateNotice: checked.value });
    return json(204, null);
  });
}

async function deleteEvent({ db, request, ids: [id] }) {
  const secret = bearer(request);
  await deleteInvitation(db, id, secret);
  return json(204, null);
}

async function setDeadline({ db, request, ids: [id] }) {
  const secret = bearer(request);
  const { deadline } = await readBody(request);
  const normalized = deadline === null || deadline === '' ? null : deadline;
  if (normalized !== null && !isValidDate(normalized)) throw new Refusal(400, 'deadline');
  return db.transaction(async (tx) => {
    const event = await verifyHost(tx, id, secret, { token: false });
    const updated = await updateSettings(tx, id, event, { deadline: normalized });
    return json(200, updated);
  });
}

async function switchMode({ db, request, ids: [id] }) {
  const secret = bearer(request);
  const { mode } = await readBody(request);
  if (!MODES.includes(mode)) throw new Refusal(400, 'body');
  return db.transaction(async (tx) => {
    const event = await verifyHost(tx, id, secret, { token: false });
    const updated = await updateSettings(tx, id, event, { mode });
    return json(200, updated);
  });
}
