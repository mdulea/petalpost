// Fails when the tracker action coordinator or batch-party retry state machine break. Checks: serializing tracker
// actions with re-entrancy locking; disabling and restoring controls without re-enabling already-disabled controls;
// status clearing, message writing and reload policies ('always', 'ok', 'change', 'none'); stopping all writes and
// reloads on a 410 response from createClient; preparing party batches (name validation, 300-party cap, id reuse on
// retry); partial-failure retry state transitions across transient 5xx/offline errors, non-retryable 4xx errors and
// successful retries.
// Run: pnpm exec node tests/check-tracker.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createClient } from '../public/js/api-client.js';
import { newId, newSecret } from '../public/js/rsvp.js';
import { applyBatchResult, prepareBatch } from '../public/js/tracker/batch-parties.js';
import { createTrackerCoordinator } from '../public/js/tracker/coordinator.js';

test('createTrackerCoordinator serializes actions, preserves already-disabled controls, and applies reload policies', async () => {
  let loads = 0;
  const coordinator = createTrackerCoordinator({
    load: async () => {
      loads += 1;
    },
  });
  let finishFirst;
  const firstPending = new Promise((resolve) => {
    finishFirst = resolve;
  });
  const activeControl = { disabled: false };
  const preDisabled = { disabled: true };
  const statuses = [];

  const firstRun = coordinator.run({
    controls: [activeControl, preDisabled],
    setStatus: (text) => statuses.push(text),
    action: () => firstPending,
    reload: 'ok',
  });
  assert.equal(coordinator.isBusy(), true);
  assert.equal(activeControl.disabled, true);
  assert.equal(preDisabled.disabled, true);

  // Concurrent click from another section is rejected while the first action runs.
  let secondRan = false;
  const skipped = await coordinator.run({
    action: async () => {
      secondRan = true;
      return { ok: true };
    },
  });
  assert.deepEqual([skipped, secondRan], [{ ok: false, skipped: true }, false]);

  finishFirst({ ok: true, status: 200, message: 'Saved.' });
  await firstRun;
  assert.equal(coordinator.isBusy(), false);
  assert.equal(activeControl.disabled, false);
  assert.equal(preDisabled.disabled, true);
  assert.deepEqual(statuses, ['', 'Saved.']);
  assert.equal(loads, 1);

  // reload: 'change' reloads on 409/404 and skips on 400; reload: 'none' never reloads.
  await coordinator.run({ action: async () => ({ ok: false, status: 400 }), reload: 'change' });
  assert.equal(loads, 1);
  await coordinator.run({ action: async () => ({ ok: false, status: 409 }), reload: 'change' });
  assert.equal(loads, 2);
  await coordinator.run({ action: async () => ({ ok: true, status: 204 }), reload: 'none' });
  assert.equal(loads, 2);
});

test('createTrackerCoordinator stops reloads and later actions when an injected client receives 410', async () => {
  let loads = 0;
  let endedCalls = 0;
  const coordinator = createTrackerCoordinator({
    load: async () => {
      loads += 1;
    },
    onEnded: () => {
      endedCalls += 1;
    },
  });
  const client = createClient(
    async () =>
      new Response(JSON.stringify({ error: 'This invitation has ended.' }), {
        status: 410,
        headers: { 'content-type': 'application/json' },
      }),
    { onEnded: () => coordinator.markEnded() },
  );
  const statuses = [];
  const cred = { id: newId(), secret: newSecret() };
  const result = await coordinator.run({
    setStatus: (text) => statuses.push(text),
    action: () => client.deleteEvent(cred),
    reload: 'always',
  });
  assert.equal(result.status, 410);
  assert.equal(coordinator.isEnded(), true);
  assert.equal(endedCalls, 1);
  assert.equal(loads, 0);
  assert.deepEqual(statuses, ['']);

  // Any later action after 410 is skipped.
  let ranAfterEnd = false;
  const blocked = await coordinator.run({
    action: async () => {
      ranAfterEnd = true;
      return { ok: true };
    },
  });
  assert.deepEqual([blocked, ranAfterEnd], [{ ok: false, skipped: true }, false]);
});

test('prepareBatch validates names and 300-party cap, and reuses retry state unchanged', () => {
  let next = 0;
  const makeId = () => `id-${++next}`;
  assert.deepEqual(prepareBatch(null, { text: ' \n ', defaultSeats: 2, lang: 'en', existingCount: 0, makeId }), {
    ok: false,
    error: 'invalidName',
  });
  assert.deepEqual(
    prepareBatch(null, { text: 'a'.repeat(81), defaultSeats: 2, lang: 'en', existingCount: 0, makeId }),
    { ok: false, error: 'invalidName' },
  );
  assert.deepEqual(prepareBatch(null, { text: 'Ana\nIon', defaultSeats: 2, lang: 'en', existingCount: 299, makeId }), {
    ok: false,
    error: 'limit',
  });

  const prepared = prepareBatch(null, { text: ' Ana \n\nIon ', defaultSeats: 3, lang: 'ro', existingCount: 1, makeId });
  assert.deepEqual(prepared, {
    ok: true,
    batch: {
      entries: [
        { name: 'Ana', id: 'id-1' },
        { name: 'Ion', id: 'id-2' },
      ],
      defaultSeats: 3,
      lang: 'ro',
    },
  });

  // Active retry ignores changed form fields and keeps the same ids, seats and language.
  const reused = prepareBatch(prepared.batch, { text: 'Changed', defaultSeats: 1, lang: 'en', existingCount: 100 });
  assert.deepEqual(reused, prepared);
});

test('applyBatchResult locks remaining entries on transient failures, unlocks on 4xx, and resets on success', () => {
  const batch = {
    entries: [
      { name: 'Ana', id: 'id-1' },
      { name: 'Ion', id: 'id-2' },
      { name: 'Maria', id: 'id-3' },
    ],
    defaultSeats: 3,
    lang: 'ro',
  };

  // Partial 503 failure keeps only unconfirmed entries locked for retry.
  const partial503 = applyBatchResult(batch, { ok: false, status: 503, added: 1 });
  assert.deepEqual(partial503, {
    retry: {
      entries: [
        { name: 'Ion', id: 'id-2' },
        { name: 'Maria', id: 'id-3' },
      ],
      defaultSeats: 3,
      lang: 'ro',
    },
    locked: true,
    reset: false,
    remainingText: 'Ion\nMaria',
    partial: true,
    retryable: true,
  });

  // Network failure (status 0) on the retry keeps the remaining entries locked.
  const offline = applyBatchResult(partial503.retry, { ok: false, status: 0, added: 0 });
  assert.equal(offline.locked, true);
  assert.equal(offline.partial, false);
  assert.deepEqual(offline.retry, partial503.retry);

  // Non-retryable 429 clears retry lock while keeping unconfirmed names visible.
  const nonRetryable = applyBatchResult(partial503.retry, { ok: false, status: 429, added: 1 });
  assert.deepEqual(nonRetryable, {
    retry: null,
    locked: false,
    reset: false,
    remainingText: 'Maria',
    partial: true,
    retryable: false,
  });

  // Success resets the form and clears retry lock.
  const done = applyBatchResult(partial503.retry, { ok: true, added: 2 });
  assert.deepEqual(done, {
    retry: null,
    locked: false,
    reset: true,
    remainingText: '',
    partial: false,
    retryable: false,
  });
});
