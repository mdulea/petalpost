// Guest replies, private links and base64url helpers. It has no DOM access, because the browser and server share it
// and tests/check-rsvp.js runs it in Node.
import { normalizeLang } from './i18n.js';

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
// answer is yes and takes the largest party size, as makeReply derives them. A reply whose answers include none to
// ids, such as one to the sub-events the host later took from the party, has no answers key and covers no people, so
// it holds no seats and has no meal counts, as a declining reply. A reply without answers and null stay unchanged.
export function partyReply(reply, ids) {
  if (!reply?.answers) return reply;
  const { answers, ...rest } = reply;
  const kept = ids.filter((id) => Object.hasOwn(answers, id)).map((id) => [id, answers[id]]);
  if (!kept.length) {
    const { meals, ...declined } = rest;
    return { ...declined, attending: false, partySize: 0 };
  }
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

const encoder = new TextEncoder();

// Imports an HMAC-SHA-256 signing key once so callers deriving links for many parties reuse the key.
export const importPartySigningKey = (parentSecret) =>
  crypto.subtle.importKey('raw', encoder.encode(parentSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);

// Signs one party link secret using a pre-imported HMAC signing key from importPartySigningKey.
export async function signPartySecret(key, partyId, purpose, generation = null) {
  const original = `petalpost:${purpose}:${partyId}`;
  const message = generation === null ? original : `${original}:${generation}`;
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(message));
  return toBase64url(signature);
}

// Separate HMAC domains derive each party's personal secret from the management secret for each link generation
// and its view secret from the personal secret. The original links have no generation. Only their hashes are stored.
export async function partyLinkSecret(parentSecret, partyId, purpose, generation = null) {
  const key = await importPartySigningKey(parentSecret);
  return signPartySecret(key, partyId, purpose, generation);
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
export function toBase64url(bytes) {
  let binary = '';
  for (const b of new Uint8Array(bytes)) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Decodes base64url text without padding into a Uint8Array.
export const fromBase64url = (text) =>
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

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
