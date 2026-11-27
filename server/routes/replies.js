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
import { ID_PATTERN } from '../../public/js/rsvp.js';
import {
  attachReplyToParty,
  listTrackerResponses,
  readOpenReply,
  saveOpenReply,
  withdrawOpenReply,
} from '../parties.js';
import { bearer, json, readBody, Refusal } from './shared.js';

export const routes = [
  { pattern: /^\/api\/events\/([^/]+)\/responses$/, methods: { GET: listResponses } },
  {
    pattern: /^\/api\/events\/([^/]+)\/responses\/([^/]+)$/,
    methods: { GET: getReply, PUT: putReply, DELETE: withdrawReply },
  },
  { pattern: /^\/api\/events\/([^/]+)\/responses\/([^/]+)\/attach$/, methods: { POST: attachReply } },
];

async function listResponses({ db, request, ids: [id] }) {
  const secret = bearer(request);
  return json(200, await listTrackerResponses(db, id, secret));
}

async function getReply({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  return json(200, await readOpenReply(db, eventId, id, secret));
}

async function putReply({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const body = await readBody(request);
  const result = await saveOpenReply(db, eventId, id, secret, body);
  return json(result.status, result.body);
}

async function withdrawReply({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const body = await readBody(request);
  if (body.version === undefined) throw new Refusal(400, 'version');
  await withdrawOpenReply(db, eventId, id, secret, body.version);
  return json(204, null);
}

async function attachReply({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const { partyId } = await readBody(request);
  if (typeof partyId !== 'string' || !ID_PATTERN.test(partyId)) throw new Refusal(400, 'body');
  await attachReplyToParty(db, eventId, id, partyId, secret);
  return json(204, null);
}
