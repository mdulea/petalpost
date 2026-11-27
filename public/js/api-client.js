// Browser HTTP client and anonymous action counter for /api paths. Separated from public/js/rsvp.js so server
// modules never pull browser transport code or UI string tables. No DOM access, so tests/check-dom-free.js runs it
// in Node.
import { UI, normalizeLang } from './i18n.js';
import { API_BODY_LIMIT } from './rsvp.js';

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

/**
 * The API client. fetchFn has the fetch shape and receives relative /api paths.
 * Every method resolves {ok, status, data, message} and never throws: data is the parsed JSON body or null,
 * message is null on success and text to show the user on failure, and status is 0 when the network failed.
 * When onEnded is supplied, a 410 response invokes onEnded({status: 410, data, message}) before resolving.
 * Credentials are {id, secret, version}; version is null before the first successful write.
 * @param {typeof fetch} [fetchFn]
 * @param {{ lang?: string, onEnded?: (info: { status: number, data: any, message: string }) => void }} [options]
 */
export function createClient(fetchFn = fetch, { lang = 'en', onEnded = undefined } = {}) {
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
    if (response.status === 410) onEnded?.({ status: 410, data, message });
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
