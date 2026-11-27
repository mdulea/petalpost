// Under /api/events/{eventId}/parties, POST with the management secret adds a batch from
// {entries: [{id, name}], defaultSeats, lang}. PUT /{id} adds one from {name, defaultSeats, lang}.
// On /{id}, GET uses the personal secret, records the first and last opened times and returns
// {t, d, name, defaultSeats, reply, deadlineClosed, table}. GET on /{id}/view uses the view secret and returns
// {t, d, name} without recording an opened time. Both reads also return updateNotice when set.
// PATCH on /parties accepts a host credential and {ids, subEvents} and returns 204.
// PATCH on /{id} with the personal secret saves a reply and returns {version}; DELETE withdraws it.
// PATCH on /{id}/link needs the management secret and {action, linkGeneration} to revoke or regenerate links.
// PATCH on /{id}/seats accepts a host credential and {partySize, meals?, version?} when there are no sub-events.
// On /{id}/manage, PATCH {name} renames a party and DELETE removes it and its reply with a host credential.
// PATCH on /{id}/reply uses the management secret to record or edit the reply even after the deadline.
import { validPartyName } from '../../public/js/guest-list.js';
import { ID_PATTERN, PARTY_LIMITS } from '../../public/js/rsvp.js';
import {
  changePartyLink,
  deleteParty as removeParty,
  insertParties,
  readPartyPersonal,
  readPartyView,
  renameParty as updatePartyName,
  saveGuestPartyReply,
  saveHostPartyReply,
  setPartySeats as updatePartySeats,
  setPartySubEvents as updatePartySubEvents,
  withdrawGuestPartyReply,
} from '../parties.js';
import { bearer, json, readBody, Refusal } from './shared.js';

export const routes = [
  { pattern: /^\/api\/events\/([^/]+)\/parties\/([^/]+)\/view$/, methods: { GET: getView } },
  { pattern: /^\/api\/events\/([^/]+)\/parties$/, methods: { POST: addParties, PATCH: setSubEvents } },
  {
    pattern: /^\/api\/events\/([^/]+)\/parties\/([^/]+)$/,
    methods: { PUT: addParty, GET: getParty, PATCH: saveReply, DELETE: withdrawReply },
  },
  { pattern: /^\/api\/events\/([^/]+)\/parties\/([^/]+)\/link$/, methods: { PATCH: changeLink } },
  {
    pattern: /^\/api\/events\/([^/]+)\/parties\/([^/]+)\/manage$/,
    methods: { PATCH: renameParty, DELETE: deleteParty },
  },
  { pattern: /^\/api\/events\/([^/]+)\/parties\/([^/]+)\/seats$/, methods: { PATCH: setPartySeats } },
  { pattern: /^\/api\/events\/([^/]+)\/parties\/([^/]+)\/reply$/, methods: { PATCH: saveHostReply } },
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

async function changeLink({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const { action, linkGeneration } = await readBody(request);
  if (
    (action !== 'revoke' && action !== 'regenerate') ||
    (linkGeneration !== null && (typeof linkGeneration !== 'string' || !ID_PATTERN.test(linkGeneration)))
  ) {
    throw new Refusal(400, 'body');
  }
  await changePartyLink(db, eventId, id, secret, { action, linkGeneration });
  return json(204, null);
}

async function getView({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  return json(200, await readPartyView(db, eventId, id, secret));
}

async function renameParty({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const { name } = await readBody(request);
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!validPartyName(trimmed)) throw new Refusal(400, 'partyName');
  await updatePartyName(db, eventId, id, secret, trimmed);
  return json(204, null);
}

async function deleteParty({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  await removeParty(db, eventId, id, secret);
  return json(204, null);
}

async function getParty({ db, request, ids: [eventId, id], now }) {
  const secret = bearer(request);
  return json(200, await readPartyPersonal(db, eventId, id, secret, now));
}

async function saveReply({ db, request, ids: [eventId, id], now }) {
  const secret = bearer(request);
  const body = await readBody(request);
  const result = await saveGuestPartyReply(db, eventId, id, secret, body, now);
  return json(result.status, result.body);
}

async function saveHostReply({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const body = await readBody(request);
  const result = await saveHostPartyReply(db, eventId, id, secret, body);
  return json(result.status, result.body);
}

async function withdrawReply({ db, request, ids: [eventId, id], now }) {
  const secret = bearer(request);
  const { version } = await readBody(request);
  if (version === undefined) throw new Refusal(400, 'version');
  await withdrawGuestPartyReply(db, eventId, id, secret, version, now);
  return json(204, null);
}

async function setPartySeats({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const { partySize, meals, version } = await readBody(request);
  if (!Number.isInteger(partySize) || partySize < 0 || partySize > PARTY_LIMITS.seats) {
    throw new Refusal(400, 'partySeats');
  }
  return json(200, await updatePartySeats(db, eventId, id, secret, { partySize, meals, version }));
}

const distinctIds = (list) =>
  Array.isArray(list) &&
  list.length > 0 &&
  list.length <= PARTY_LIMITS.count &&
  list.every((id) => typeof id === 'string' && ID_PATTERN.test(id)) &&
  new Set(list).size === list.length;

async function setSubEvents({ db, request, ids: [eventId] }) {
  const secret = bearer(request);
  const { ids, subEvents } = await readBody(request);
  if (!distinctIds(ids)) throw new Refusal(400, 'partySubEvents');
  await updatePartySubEvents(db, eventId, secret, ids, subEvents);
  return json(204, null);
}
