// Guest replies, private links and the RSVP API client. It has no DOM access, because the browser and
// server/api.js share it and scripts/check-rsvp.js runs it in Node.

export const REPLY_LIMITS = { name: 80, partySize: 10 };

// Ids are 16 random bytes and secrets 32, both base64url without padding.
export const ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;
export const SECRET_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// The only constructor for a reply: untrusted {name, attending, partySize} becomes a valid reply, or null.
// The name is trimmed and holds 1 to 80 code points without control characters. An attending guest brings
// a party of 1 to 10 people; a declined reply has a party size of exactly 0.
export function makeReply(source) {
  if (!source || typeof source !== 'object') return null;
  const { name, attending, partySize } = source;
  if (typeof name !== 'string' || typeof attending !== 'boolean' || !Number.isInteger(partySize)) return null;
  const trimmed = name.trim();
  const length = [...trimmed].length;
  if (length < 1 || length > REPLY_LIMITS.name || /\p{Cc}/u.test(trimmed)) return null;
  if (attending ? partySize < 1 || partySize > REPLY_LIMITS.partySize : partySize !== 0) return null;
  return { name: trimmed, attending, partySize };
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
export const editorPage = (origin) => `${origin}/editor.html`;

// Private links keep the secret in the fragment, which the browser never sends to a server.
// base is the editor page URL; readCredential(hash, 'r=') reads the response edit link back.
export const responseLink = (base, eventId, responseId, secret) =>
  `${base}?view=1&e=${eventId}#r=${responseId}.${secret}`;
// readCredential(hash, '') reads the management link back.
export const manageLink = (origin, id, secret) => `${origin}/manage.html#${id}.${secret}`;

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

const OFFLINE = 'Petalpost could not be reached. Check your connection and try again.';
const UNEXPECTED = 'Something went wrong on the server. Try again in a minute.';

// The API client. fetchFn has the fetch shape and receives relative /api paths.
// Every method resolves {ok, status, data, message} and never throws: data is the parsed JSON body or null,
// message is null on success and text to show the user on failure, and status is 0 when the network failed.
// Credentials are {id, secret, version}; version is null before the first successful write.
export function createClient(fetchFn = fetch) {
  async function call(method, path, secret, body) {
    const headers = {};
    if (secret) headers.authorization = `Bearer ${secret}`;
    if (body) headers['content-type'] = 'application/json';
    let response;
    try {
      response = await fetchFn(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch {
      return { ok: false, status: 0, data: null, message: OFFLINE };
    }
    let data = null;
    try {
      if (response.status !== 204) data = await response.json();
    } catch {
      data = null;
    }
    if (response.ok) return { ok: true, status: response.status, data, message: null };
    const message = typeof data?.error === 'string' ? data.error : UNEXPECTED;
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
    // position stays local. data is {version, created}.
    publish(cred, record) {
      const { photoY, ...d } = record.d;
      return save(eventPath(cred.id), cred, { t: record.t, d });
    },
    // Public presentation fields {t, d} of an event.
    loadEvent: (id) => call('GET', eventPath(id)),
    // Removes the event and every reply to it; data is null.
    deleteEvent: (cred) => call('DELETE', eventPath(cred.id), cred.secret),
    // data is {t, d, version, responses: [{name, attending, partySize, createdAt, updatedAt}], totals}.
    loadResponses: (cred) => call('GET', `${eventPath(cred.id)}/responses`, cred.secret),
    // Creates the guest's reply {name, attending, partySize}, or updates it when cred.version is set.
    // data is {version, created}.
    saveReply: (eventId, cred, reply) => save(replyPath(eventId, cred.id), cred, reply),
    // data is {name, attending, partySize, version}.
    loadReply: (eventId, cred) => call('GET', replyPath(eventId, cred.id), cred.secret),
  };
}
