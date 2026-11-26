// DOM-free guest-list helpers: party name validation, paste parsing, whole-list totals and search/status filtering.
import { PARTY_LIMITS, partyStatus } from './rsvp.js';

export function validPartyName(name) {
  const length = [...name].length;
  return length > 0 && length <= PARTY_LIMITS.name && !/\p{Cc}/u.test(name);
}

export const parsePartyNames = (text) =>
  text
    .split(/\r\n|[\r\n]/)
    .map((line) => line.trim())
    .filter(Boolean);

// Sums accepted seats, declined parties and parties without a reply across the whole guest list. Earlier replies
// without a party add their accepted seats and count a decline as a declined party.
export function partyTotals(parties, unattached = []) {
  let accepted = 0;
  let declined = 0;
  let pending = 0;
  for (const { reply } of parties) {
    if (!reply) pending++;
    else if (reply.attending) accepted += reply.partySize;
    else declined++;
  }
  for (const reply of unattached) {
    if (reply.attending) accepted += reply.partySize;
    else declined++;
  }
  return { accepted, declined, pending };
}

// Normalizes a search query for case- and Unicode-insensitive matching against party names.
export const normalizePartySearch = (text) => text.trim().toLocaleLowerCase().normalize();

// Matches a normalized name query and a link status, including 'pending' for any party without a reply.
export function partyMatches(party, query, filter) {
  const status = partyStatus(party);
  return (
    party.name.toLocaleLowerCase().normalize().includes(query) &&
    (filter === 'all' || status === filter || (filter === 'pending' && status !== 'replied'))
  );
}
