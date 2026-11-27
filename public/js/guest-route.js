// DOM-free five-way guest link resolution and load transitions:
// 1. view link (#v=<id>.<secret>)
// 2. personal link (#p=<id>.<secret>)
// 3. malformed party credential (#p=... or #v=... that fails credential format)
// 4. guest-list public invitation link (no party credential, loaded event is guestList mode)
// 5. open-mode invitation link or reply edit link (#r=<id>.<secret>)
// Listed in tests/check-dom-free.js.
import { modeOf } from './invite.js';
import { partyLinkPrefix, readCredential } from './rsvp.js';

// Classifies a published guest link from its event id and URL hash before fetching.
export function classifyGuestLink({ eventId, hash = '' }) {
  const prefix = partyLinkPrefix(hash);
  if (prefix) {
    const credential = readCredential(hash, prefix);
    if (!credential) return { kind: 'malformedParty', eventId, prefix };
    return { kind: prefix === 'v=' ? 'view' : 'personal', eventId, credential };
  }
  const replyCredential = readCredential(hash, 'r=');
  return {
    kind: 'open',
    eventId,
    isReplyEdit: hash.startsWith('#r='),
    replyCredential,
  };
}

// Resolves the server response for a classified guest link into the UI view state.
export function resolveGuestLoad(route, result) {
  if (route.kind === 'view' || route.kind === 'personal') {
    if (!result.ok) {
      return {
        kind: 'unavailable',
        heading: result.status === 410 ? 'ended' : 'loadFailed',
        message: result.message,
      };
    }
    return { kind: route.kind, data: result.data };
  }
  if (!result.ok) {
    return {
      kind: 'error',
      heading: result.status === 410 ? 'ended' : result.status === 404 ? 'missing' : 'loadFailed',
      message: result.message,
    };
  }
  if (modeOf(result.data.d) === 'guestList') {
    return { kind: 'guestListPublic', data: result.data, showReplyLinkUnavailable: route.isReplyEdit };
  }
  return { kind: 'openForm', data: result.data, loadReplyCredential: route.replyCredential };
}

// Whether changing the URL hash on a published guest page requires a reload to switch credential context.
export const shouldReloadOnHashChange = (route, nextHash = '') =>
  route.kind === 'view' ||
  route.kind === 'personal' ||
  route.kind === 'malformedParty' ||
  Boolean(route.isReplyEdit) ||
  Boolean(partyLinkPrefix(nextHash)) ||
  nextHash.startsWith('#r=');
