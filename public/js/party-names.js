// Checks stored names and parses one name per line, with surrounding whitespace and blank lines removed.
import { PARTY_LIMITS } from './rsvp.js';

export function validPartyName(name) {
  const length = [...name].length;
  return length > 0 && length <= PARTY_LIMITS.name && !/\p{Cc}/u.test(name);
}

export const parsePartyNames = (text) =>
  text
    .split(/\r\n|[\r\n]/)
    .map((line) => line.trim())
    .filter(Boolean);
