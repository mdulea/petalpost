// DOM-free state machine for batch party creation and partial-failure retries in the tracker.
// Keeps retry ids, defaultSeats, and lang intact across transient network or 5xx errors so retrying creates no
// duplicates and never re-enables locked language controls prematurely. Listed in tests/check-dom-free.js.
import { parsePartyNames, validPartyName } from '../guest-list.js';
import { newId, PARTY_LIMITS } from '../rsvp.js';

// Prepares the next batch to send: reuses retry unchanged when present, or parses and validates text against the
// guest-list limits. Returns {ok: true, batch} or {ok: false, error: 'invalidName' | 'limit'}.
export function prepareBatch(retry, { text, defaultSeats, lang, existingCount, makeId = newId }) {
  if (retry) return { ok: true, batch: retry };
  const names = parsePartyNames(text);
  if (!names.length || !names.every(validPartyName)) return { ok: false, error: 'invalidName' };
  if (existingCount + names.length > PARTY_LIMITS.count) return { ok: false, error: 'limit' };
  return {
    ok: true,
    batch: {
      entries: names.map((name) => ({ name, id: makeId() })),
      defaultSeats,
      lang,
    },
  };
}

// Transitions batch state from an addParties result. Transient failures (status 0 or >= 500) keep the unconfirmed
// entries locked for an idempotent retry with the same ids, defaultSeats, and lang.
export function applyBatchResult(batch, result) {
  const remaining = batch.entries.slice(result.added ?? 0);
  if (result.ok) {
    return { retry: null, locked: false, reset: true, remainingText: '', partial: false, retryable: false };
  }
  const retryable = (result.status === 0 || result.status >= 500) && remaining.length > 0;
  const retry = retryable ? { ...batch, entries: remaining } : null;
  return {
    retry,
    locked: Boolean(retry),
    reset: false,
    remainingText: remaining.map(({ name }) => name).join('\n'),
    partial: Boolean(result.added),
    retryable,
  };
}
