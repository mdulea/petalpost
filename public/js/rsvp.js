// Guest replies, private links and the RSVP API client. It has no DOM access, because the browser and
// server/api.js share it and tests/check-rsvp.js runs it in Node.
import { UI, normalizeLang } from './i18n.js';

export const REPLY_LIMITS = { name: 80, partySize: 10, note: 300 };
export const PARTY_LIMITS = { name: REPLY_LIMITS.name, seats: 20, count: 300 };
export const API_BODY_LIMIT = 8 * 1024;

// Ids are 16 random bytes and secrets 32, both base64url without padding.
export const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
export const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// The fields of a reply, in the order the reply form shows them. A reply to an invitation with sub-events has
// answers in place of attending and partySize, and an attending reply to an invitation with menu options has meals.
export const REPLY_FIELDS = ['name', 'attending', 'partySize', 'answers', 'meals', 'note'];

// An attending party has 1 to limit people, and a declined answer has a party size of exactly 0. Without a valid
// attending, the party size only has to be a whole number.
const invalidPartySize = (attending, partySize, limit) =>
  !Number.isInteger(partySize) ||
  (attending === true && (partySize < 1 || partySize > limit)) ||
  (attending === false && partySize !== 0);

const validAnswer = (answer, limit) =>
  Boolean(answer) &&
  typeof answer === 'object' &&
  Object.keys(answer).length === 2 &&
  typeof answer.attending === 'boolean' &&
  !invalidPartySize(answer.attending, answer.partySize, limit);

// Exactly one valid answer for each id, and no other key.
const validAnswers = (answers, ids, limit) =>
  Boolean(answers) &&
  typeof answers === 'object' &&
  !Array.isArray(answers) &&
  Object.keys(answers).length === ids.length &&
  ids.every((id) => Object.hasOwn(answers, id) && validAnswer(answers[id], limit));

// Exactly one whole count of 0 or more for each id, no other key, and a sum of people.
const validMeals = (meals, ids, people) =>
  Boolean(meals) &&
  typeof meals === 'object' &&
  !Array.isArray(meals) &&
  Object.keys(meals).length === ids.length &&
  ids.every((id) => Object.hasOwn(meals, id) && Number.isInteger(meals[id]) && meals[id] >= 0) &&
  ids.reduce((sum, id) => sum + meals[id], 0) === people;

// The only constructor for a reply, which also validates it: untrusted {name, attending, partySize, answers, meals,
// note} becomes {reply, invalid}. reply is the valid {name, attending, partySize, answers?, meals?, note}, or null when
// invalid lists
// the invalid fields in REPLY_FIELDS order. The name is trimmed and holds 1 to 80 code points without control
// characters. The note is optional and defaults to empty. It is trimmed, its line breaks become \n, and it holds at
// most 300 code points without control characters other than \n.
// Without subEventIds, the reply gives one answer: attending, with a party size from 1 to partySizeLimit when
// attending or 0 when not. The reply then has no answers key, whatever the source holds.
// With subEventIds, the ids of the invitation's sub-events, source.answers maps each id, and no other key, to
// {attending, partySize} under the same rules. The source's own attending and partySize are ignored. The reply
// attends when any answer is yes, and its party size is the largest party size among its answers, which is the
// number of people the reply covers.
// With menuIds, the ids of the invitation's menu options, an attending reply's source.meals maps each id, and no other
// key, to a whole count of 0 or more, and the counts add up to the reply's party size. A declining reply has no meals
// key, whatever the source holds. meals is checked only once the answer and party size are valid. Without menuIds the
// reply has no meals key.
export function makeReply(source, { partySizeLimit = REPLY_LIMITS.partySize, subEventIds = [], menuIds = [] } = {}) {
  const { name, attending, partySize, answers, meals, note = '' } = source && typeof source === 'object' ? source : {};
  const trimmed = typeof name === 'string' ? name.trim() : '';
  const length = [...trimmed].length;
  const noteText = typeof note === 'string' ? note.replace(/\r\n?/g, '\n').trim() : '';
  const bySubEvent = subEventIds.length > 0;
  const isInvalid = {
    name: length < 1 || length > REPLY_LIMITS.name || /\p{Cc}/u.test(trimmed),
    attending: !bySubEvent && typeof attending !== 'boolean',
    partySize: !bySubEvent && invalidPartySize(attending, partySize, partySizeLimit),
    answers: bySubEvent && !validAnswers(answers, subEventIds, partySizeLimit),
    meals: false,
    note: typeof note !== 'string' || [...noteText].length > REPLY_LIMITS.note || /(?!\n)\p{Cc}/u.test(noteText),
  };
  const answersById =
    bySubEvent && !isInvalid.answers
      ? Object.fromEntries(
          subEventIds.map((id) => [id, { attending: answers[id].attending, partySize: answers[id].partySize }]),
        )
      : null;
  const peopleCovered = answersById ? Math.max(...subEventIds.map((id) => answersById[id].partySize)) : partySize;
  const hasMeals = menuIds.length > 0 && !isInvalid.attending && !isInvalid.partySize && peopleCovered > 0;
  isInvalid.meals = hasMeals && !isInvalid.answers && !validMeals(meals, menuIds, peopleCovered);
  const invalid = REPLY_FIELDS.filter((field) => isInvalid[field]);
  if (invalid.length) return { reply: null, invalid };
  return {
    reply: {
      name: trimmed,
      attending: peopleCovered > 0,
      partySize: peopleCovered,
      ...(answersById ? { answers: answersById } : {}),
      ...(hasMeals ? { meals: Object.fromEntries(menuIds.map((id) => [id, meals[id]])) } : {}),
      note: noteText,
    },
    invalid,
  };
}

// Totals for the host: responses counts every reply, yes and no count the answers,
// and attending sums the party sizes of the yes answers.
export function tally(responses) {
  const yes = responses.filter((r) => r.attending);
  return {
    responses: responses.length,
    yes: yes.length,
    no: responses.length - yes.length,
    attending: yes.reduce((sum, r) => sum + r.partySize, 0),
  };
}

// The answers key of a reply read from its stored answers, the database's {} for a reply without sub-events. A reply
// without answers has no key, so it keeps the shape of a reply from before sub-events.
export const answersOf = (stored) => (stored && Object.keys(stored).length ? { answers: stored } : {});
// The answers column value of a reply from makeReply: its answers as JSON, or {} for a reply without sub-events.
export const storedAnswers = (reply) => JSON.stringify(reply.answers ?? {});

// The meals key of a reply read from its stored meal counts, the database's {} for a reply without them.
export const mealsOf = (stored) => (stored && Object.keys(stored).length ? { meals: stored } : {});
// The meals column value of a reply from makeReply: its meal counts as JSON, or {} for a reply without them.
export const storedMeals = (reply) => JSON.stringify(reply.meals ?? {});

// The meal totals of each menu option id, in order, over replies: count sums the counts of the option. missing counts
// the attending replies without meal counts, such as one saved before the host added the menu. A reply saved before
// the host added an option has no count for it and adds 0 to that option.
export function mealTally(ids, replies) {
  const attending = replies.filter((reply) => reply.attending);
  return {
    options: ids.map((id) => ({ id, count: attending.reduce((sum, reply) => sum + (reply.meals?.[id] ?? 0), 0) })),
    missing: attending.filter((reply) => !reply.meals).length,
  };
}

// reply as a party invited to the sub-events ids has it: only its answers to ids, from which it attends when any
// answer is yes and takes the largest party size, as makeReply derives them. A reply without an answer to ids has no
// answers key and keeps its stored answer and party size. null stays null.
export function partyReply(reply, ids) {
  if (!reply?.answers) return reply;
  const { answers, ...rest } = reply;
  const kept = ids.filter((id) => Object.hasOwn(answers, id)).map((id) => [id, answers[id]]);
  if (!kept.length) return rest;
  const partySize = Math.max(...kept.map(([, answer]) => answer.partySize));
  return { ...rest, attending: partySize > 0, partySize, answers: Object.fromEntries(kept) };
}

// The answer of reply to the sub-event id as {attending, partySize}, or null when the reply has none. A reply saved
// before the host added the sub-event has none, and a reply saved before the invitation had sub-events has no answers.
export const answerTo = (reply, id) => (reply.answers && Object.hasOwn(reply.answers, id) ? reply.answers[id] : null);

// The totals of each sub-event id, in order, over replies: yes and no count the answers, attending sums the party
// sizes of the yes answers, and unanswered counts the replies without an answer to the sub-event.
export const subEventTally = (ids, replies) =>
  ids.map((id) => {
    const answers = replies.map((reply) => answerTo(reply, id));
    const yes = answers.filter((a) => a?.attending);
    return {
      id,
      yes: yes.length,
      no: answers.filter((a) => a && !a.attending).length,
      attending: yes.reduce((sum, a) => sum + a.partySize, 0),
      unanswered: answers.filter((a) => !a).length,
    };
  });

// The editor page URL on the site origin. Share, invitation and response edit links start from it.
export const editorPage = (origin, lang = 'en') =>
  normalizeLang(lang) === 'ro' ? `${origin}/ro/editor.html` : `${origin}/editor.html`;

// Private links keep the secret in the fragment, which the browser never sends to a server.
// readCredential(hash, 'r=') reads the response edit link back.
export const responseLink = (origin, eventId, responseId, secret, lang = 'en') =>
  `${origin}${normalizeLang(lang) === 'ro' ? '/ro' : ''}/e/${eventId}#r=${responseId}.${secret}`;
// readCredential(hash, '') reads the management link back.
export const manageLink = (origin, id, secret, lang = 'en') =>
  `${origin}${normalizeLang(lang) === 'ro' ? '/ro/manage.html' : '/manage.html'}#${id}.${secret}`;
// A passkey sign-in opens the management page with its access token in place of the secret.
// readCredential(hash, 't=') reads it back.
export const signedInLink = (origin, id, token, lang = 'en') =>
  `${origin}${normalizeLang(lang) === 'ro' ? '/ro/manage.html' : '/manage.html'}#t=${id}.${token}`;

// The tracker reconstructs the party's link from its management secret without reading any secret from the API.
export const personalLink = (url, id, secret) => `${url}#p=${id}.${secret}`;

// A party's tracker status: 'replied' when it has a reply, 'opened' after a personal link load, or 'notOpened'.
export const partyStatus = (party) => (party.reply ? 'replied' : party.firstOpenedAt ? 'opened' : 'notOpened');

// Separate HMAC domains derive each party's personal secret from the management secret for each link generation
// and its view secret from the personal secret. The original links have no generation. Only their hashes are stored.
export async function partyLinkSecret(parentSecret, partyId, purpose, generation = null) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(parentSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const original = `petalpost:${purpose}:${partyId}`;
  const message = generation === null ? original : `${original}:${generation}`;
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return toBase64url(signature);
}

// A private link fragment #<prefix><id>.<secret> gives {id, secret}, or null when it is incomplete or malformed.
// Prefixes are '' for management, 't=' for passkey sign-in, 'r=' for reply edit, 'p=' for personal and 'v=' for view links.
export function readCredential(hash, prefix) {
  if (!hash.startsWith(`#${prefix}`)) return null;
  const [id, secret, ...rest] = hash.slice(prefix.length + 1).split('.');
  if (rest.length || !ID_PATTERN.test(id) || !SECRET_PATTERN.test(secret ?? '')) return null;
  return { id, secret };
}

// The party link prefix, including for a malformed credential that should show the link error.
export const partyLinkPrefix = (hash) => hash.match(/^#([pv]=)/)?.[1];
// A view credential derives from the current personal credential and gives no access to the reply.
export const viewLinkSecret = (personalSecret, id) => partyLinkSecret(personalSecret, id, 'view');
export const viewLink = (url, id, secret) => `${url}#v=${id}.${secret}`;

// base64url text without padding of the bytes, a Uint8Array or ArrayBuffer.
export const toBase64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

// base64url text of size random bytes.
const randomToken = (size) => toBase64url(globalThis.crypto.getRandomValues(new Uint8Array(size)));

// The browser generates every id and secret, so a retry after a lost confirmation reuses them.
export const newId = () => randomToken(16);
export const newSecret = () => randomToken(32);

// The actions that the browser counts through POST /api/stats. The server counts invitation_publish and
// reply_submit itself, when it stores a new invitation or reply.
export const BEACON_ACTIONS = [
  'png_download',
  'png_share',
  'invitation_link_copy',
  'invitation_link_share',
  'calendar_add',
];

// A counter for the page language: count(action) sends {action, lang} to /api/stats through beacon, which has the
// navigator.sendBeacon shape. A failed send is ignored, so counting never delays or blocks the action.
export function createCounter(beacon, lang) {
  const code = normalizeLang(lang);
  return (action) => {
    try {
      beacon('/api/stats', JSON.stringify({ action, lang: code }));
    } catch {
      // Counting is approximate by design.
    }
  };
}

// The API client. fetchFn has the fetch shape and receives relative /api paths.
// Every method resolves {ok, status, data, message} and never throws: data is the parsed JSON body or null,
// message is null on success and text to show the user on failure, and status is 0 when the network failed.
// Credentials are {id, secret, version}; version is null before the first successful write.
export function createClient(fetchFn = fetch, { lang = 'en' } = {}) {
  const code = normalizeLang(lang);
  const copy = UI[code].rsvp;

  async function call(method, path, secret, body) {
    const headers = {};
    if (code !== 'en') headers['accept-language'] = code;
    if (secret) headers.authorization = `Bearer ${secret}`;
    if (body) headers['content-type'] = 'application/json';
    let response;
    try {
      response = await fetchFn(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch {
      return { ok: false, status: 0, data: null, message: copy.offline };
    }
    let data = null;
    try {
      if (response.status !== 204) data = await response.json();
    } catch {
      data = null;
    }
    if (response.ok) return { ok: true, status: response.status, data, message: null };
    const message = typeof data?.error === 'string' ? data.error : copy.unexpected;
    return { ok: false, status: response.status, data, message };
  }

  // A create, with cred.version null, that the server reports as already done after a lost confirmation
  // repeats at once as an update with the returned version, so the newer fields still apply.
  async function save(path, cred, body) {
    const put = (version) => call('PUT', path, cred.secret, { ...body, version });
    const result = await put(cred.version ?? undefined);
    return cred.version == null && result.ok && !result.data.created ? put(result.data.version) : result;
  }

  const eventPath = (id) => `/api/events/${encodeURIComponent(id)}`;
  const replyPath = (eventId, id) => `${eventPath(eventId)}/responses/${encodeURIComponent(id)}`;
  const partyPath = (eventId, id) => `${eventPath(eventId)}/parties/${encodeURIComponent(id)}`;
  const managePartyPath = (eventId, id) => `${partyPath(eventId, id)}/manage`;
  const tablePath = (eventId, id) => `${eventPath(eventId)}/tables/${encodeURIComponent(id)}`;

  return {
    // Creates the event, or updates it when cred.version is set. record is the editor's {t, d}; the photo
    // position stays local. The page language goes with it for the server's count. data is {version, created}.
    publish(cred, record) {
      const { photoY, ...d } = record.d;
      return save(eventPath(cred.id), cred, { t: record.t, d, lang: code });
    },
    // Public presentation fields {t, d} of an event.
    loadEvent: (id) => call('GET', eventPath(id)),
    saveUpdate: (cred, updateNotice) => call('PATCH', eventPath(cred.id), cred.secret, { updateNotice }),
    // Removes the event and every reply to it; data is null.
    deleteEvent: (cred) => call('DELETE', eventPath(cred.id), cred.secret),
    // Switches the invitation between open and guestList modes; data is {mode, version}.
    switchMode: (cred, mode) => call('PATCH', `${eventPath(cred.id)}/mode`, cred.secret, { mode }),
    // data is {t, d, version, responses, totals}, with parties, tables and each unattached reply's id in guest-list mode.
    loadResponses: (cred) => call('GET', `${eventPath(cred.id)}/responses`, cred.secret),
    // Attaches an earlier unattached reply to a party without a reply; data is null.
    attachReply: (cred, responseId, partyId) =>
      call('POST', `${replyPath(cred.id, responseId)}/attach`, cred.secret, { partyId }),
    // Creates the guest's reply {name, attending, partySize, answers?, note}, or updates it when cred.version is set.
    // The page language goes with it for the server's count. data is {version, created}.
    saveReply: (eventId, cred, reply) => save(replyPath(eventId, cred.id), cred, { ...reply, lang: code }),
    // data is {name, attending, partySize, answers?, note, version}.
    loadReply: (eventId, cred) => call('GET', replyPath(eventId, cred.id), cred.secret),
    // Removes the guest's reply at cred.version; a reply that is already gone counts as withdrawn. data is null.
    withdrawReply: (eventId, cred) =>
      call('DELETE', replyPath(eventId, cred.id), cred.secret, { version: cred.version }),
    // A registration challenge for a passkey of the event; data is {challenge}. cred.secret must be the
    // management secret, because an access token cannot save passkeys.
    passkeyChallenge: (cred) => call('POST', `${eventPath(cred.id)}/passkeys/challenge`, cred.secret, {}),
    // Saves the passkey from the base64url registration {clientDataJSON, attestationObject}; data is {}.
    savePasskey: (cred, registration) => call('POST', `${eventPath(cred.id)}/passkeys`, cred.secret, registration),
    // Lists the invitation's passkeys as {passkeys: [{id, createdAt}]} using either management credential.
    listPasskeys: (cred) => call('GET', `${eventPath(cred.id)}/passkeys`, cred.secret),
    // Removes one passkey using the management secret; a passkey that is already gone counts as removed.
    removePasskey: (cred, id) => call('DELETE', `${eventPath(cred.id)}/passkeys`, cred.secret, { id }),
    // A sign-in challenge without a known invitation; data is {challenge}.
    signInChallenge: () => call('POST', '/api/passkeys/challenge', null, {}),
    // Signs in with the base64url {id, clientDataJSON, authenticatorData, signature}; data is
    // {eventId, token, expiresAt}, and the token works in place of the management secret until expiresAt.
    signIn: (assertion) => call('POST', '/api/passkeys/sign-in', null, assertion),
    // Adds one party using an id that the tracker can reuse after a lost confirmation.
    addParty: (cred, id, party) => call('PUT', partyPath(cred.id, id), cred.secret, { ...party, lang: code }),
    // Revokes or regenerates a party's links using the management secret.
    changePartyLink: (cred, id, action, linkGeneration = null) =>
      call('PATCH', `${partyPath(cred.id, id)}/link`, cred.secret, { action, linkGeneration }),
    // Adds entries with retryable ids. added counts the entries the API confirmed, including replays.
    async addParties(cred, entries, defaultSeats, lang = code) {
      const path = `${eventPath(cred.id)}/parties`;
      const encoder = new TextEncoder();
      let added = 0;
      while (added < entries.length) {
        const body = { entries: [], defaultSeats, lang };
        for (const entry of entries.slice(added)) {
          body.entries.push(entry);
          if (encoder.encode(JSON.stringify(body)).byteLength <= API_BODY_LIMIT) continue;
          if (body.entries.length > 1) body.entries.pop();
          break;
        }
        const result = await call('POST', path, cred.secret, body);
        if (!result.ok) return { ...result, added };
        added += body.entries.length;
      }
      return { ok: true, added };
    },
    // Invites the parties of ids to the sub-events of subEventIds; data is null.
    setPartySubEvents: (cred, ids, subEventIds) =>
      call('PATCH', `${eventPath(cred.id)}/parties`, cred.secret, { ids, subEvents: subEventIds }),
    // Sets, changes or clears (null) the RSVP deadline of a guest-list invitation.
    setDeadline: (cred, deadline) => call('PATCH', `${eventPath(cred.id)}/deadline`, cred.secret, { deadline }),
    // Lets the host record or edit a party's reply in the tracker, even after the RSVP deadline.
    saveHostPartyReply: (cred, id, reply) => call('PATCH', `${partyPath(cred.id, id)}/reply`, cred.secret, reply),
    // Creates a table with a reusable id or updates the current version.
    saveTable: (cred, id, table) => call('PUT', tablePath(cred.id, id), cred.secret, table),
    removeTable: (cred, id, version) => call('DELETE', tablePath(cred.id, id), cred.secret, { version }),
    // Publishes the seating plan with true and unpublishes it with false.
    setSeatingPublished: (cred, published) =>
      call('PATCH', `${eventPath(cred.id)}/seating`, cred.secret, { published }),
    assignParty: (cred, id, tableId) => call('PATCH', `${partyPath(cred.id, id)}/table`, cred.secret, { tableId }),
    loadParty: (eventId, cred) => call('GET', partyPath(eventId, cred.id), cred.secret),
    renameParty: (cred, id, name) => call('PATCH', managePartyPath(cred.id, id), cred.secret, { name }),
    deleteParty: (cred, id) => call('DELETE', managePartyPath(cred.id, id), cred.secret),
    savePartyReply: (eventId, cred, reply) =>
      call('PATCH', partyPath(eventId, cred.id), cred.secret, { ...reply, version: cred.version, lang: code }),
    withdrawPartyReply: (eventId, cred) =>
      call('DELETE', partyPath(eventId, cred.id), cred.secret, { version: cred.version }),
    loadPartyView: (eventId, cred) => call('GET', `${partyPath(eventId, cred.id)}/view`, cred.secret),
    // Sets a party's reply seats from the tracker; data is {version}.
    setPartySeats: (cred, id, update) => call('PATCH', `${partyPath(cred.id, id)}/seats`, cred.secret, update),
  };
}
