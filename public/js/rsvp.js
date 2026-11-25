// Guest replies, private links and the RSVP API client. It has no DOM access, because the browser and
// server/api.js share it and tests/check-rsvp.js runs it in Node.
import { UI, normalizeLang } from './i18n.js';

export const REPLY_LIMITS = { name: 80, partySize: 10, note: 300 };

// Ids are 16 random bytes and secrets 32, both base64url without padding.
export const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
export const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// The fields of a reply, in the order the reply form shows them.
export const REPLY_FIELDS = ['name', 'attending', 'partySize', 'note'];

// The only constructor for a reply, which also validates it: untrusted {name, attending, partySize, note} becomes
// {reply, invalid}. reply is the valid reply, or null when invalid lists the invalid fields in REPLY_FIELDS order.
// The name is trimmed and holds 1 to 80 code points without control characters. An attending guest brings
// a party of 1 to 10 people; a declined reply has a party size of exactly 0. Without a valid answer, the party size
// only has to be a whole number. The note is optional and defaults to empty. It is trimmed, its line breaks become
// \n, and it holds at most 300 code points without control characters other than \n.
export function makeReply(source) {
  const { name, attending, partySize, note = '' } = source && typeof source === 'object' ? source : {};
  const trimmed = typeof name === 'string' ? name.trim() : '';
  const length = [...trimmed].length;
  const noteText = typeof note === 'string' ? note.replace(/\r\n?/g, '\n').trim() : '';
  const isInvalid = {
    name: length < 1 || length > REPLY_LIMITS.name || /\p{Cc}/u.test(trimmed),
    attending: typeof attending !== 'boolean',
    partySize:
      !Number.isInteger(partySize) ||
      (attending === true && (partySize < 1 || partySize > REPLY_LIMITS.partySize)) ||
      (attending === false && partySize !== 0),
    note: typeof note !== 'string' || [...noteText].length > REPLY_LIMITS.note || /(?!\n)\p{Cc}/u.test(noteText),
  };
  const invalid = REPLY_FIELDS.filter((field) => isInvalid[field]);
  return { reply: invalid.length ? null : { name: trimmed, attending, partySize, note: noteText }, invalid };
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

// A private link fragment #<prefix><id>.<secret> gives {id, secret}, or null when it is incomplete or malformed.
// The prefix is '' for management links and 'r=' for response edit links.
export function readCredential(hash, prefix) {
  if (!hash.startsWith(`#${prefix}`)) return null;
  const [id, secret, ...rest] = hash.slice(prefix.length + 1).split('.');
  if (rest.length || !ID_PATTERN.test(id) || !SECRET_PATTERN.test(secret ?? '')) return null;
  return { id, secret };
}

// base64url text of size random bytes.
function randomToken(size) {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(size));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

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

  return {
    // Creates the event, or updates it when cred.version is set. record is the editor's {t, d}; the photo
    // position stays local. The page language goes with it for the server's count. data is {version, created}.
    publish(cred, record) {
      const { photoY, ...d } = record.d;
      return save(eventPath(cred.id), cred, { t: record.t, d, lang: code });
    },
    // Public presentation fields {t, d} of an event.
    loadEvent: (id) => call('GET', eventPath(id)),
    // Removes the event and every reply to it; data is null.
    deleteEvent: (cred) => call('DELETE', eventPath(cred.id), cred.secret),
    // data is {t, d, version, responses: [{name, attending, partySize, note, createdAt, updatedAt}], totals}.
    loadResponses: (cred) => call('GET', `${eventPath(cred.id)}/responses`, cred.secret),
    // Creates the guest's reply {name, attending, partySize, note}, or updates it when cred.version is set.
    // The page language goes with it for the server's count. data is {version, created}.
    saveReply: (eventId, cred, reply) => save(replyPath(eventId, cred.id), cred, { ...reply, lang: code }),
    // data is {name, attending, partySize, note, version}.
    loadReply: (eventId, cred) => call('GET', replyPath(eventId, cred.id), cred.secret),
    // Removes the guest's reply at cred.version; a reply that is already gone counts as withdrawn. data is null.
    withdrawReply: (eventId, cred) =>
      call('DELETE', replyPath(eventId, cred.id), cred.secret, { version: cred.version }),
  };
}
