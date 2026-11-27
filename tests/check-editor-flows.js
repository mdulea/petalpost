// Fails when host publish recovery transitions or five-way guest-link route transitions break. Checks: publish
// recovery for first publish, update, 409 conflict, 410 ended, 404 on live vs unconfirmed publish, and generic errors;
// five-way guest-link classification (view link, personal link, malformed party credential, guest-list public link,
// open-mode invitation and reply edit link), load resolution across 200/404/410/503, and hashchange reload rules.
// Run: pnpm exec node tests/check-editor-flows.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyGuestLink, resolveGuestLoad, shouldReloadOnHashChange } from '../public/js/guest-route.js';
import { resolvePublishResult } from '../public/js/publish-recovery.js';
import { newId, newSecret } from '../public/js/rsvp.js';

test('resolvePublishResult handles first publish, updates, 409 conflicts, 410 ended, 404 deleted, and other errors', () => {
  const first = { id: newId(), secret: newSecret(), version: null };
  const live = { ...first, version: 2 };

  assert.deepEqual(resolvePublishResult(first, { ok: true, status: 201, data: { version: 1 }, message: null }), {
    action: 'remember',
    nextCred: { ...first, version: 1 },
    outcome: 'published',
    statusKind: 'ok',
    message: '',
  });
  assert.deepEqual(resolvePublishResult(live, { ok: true, status: 200, data: { version: 3 }, message: null }), {
    action: 'remember',
    nextCred: { ...live, version: 3 },
    outcome: 'updated',
    statusKind: 'ok',
    message: '',
  });
  assert.deepEqual(
    resolvePublishResult(live, { ok: false, status: 409, data: { version: 4 }, message: 'Changed elsewhere.' }),
    {
      action: 'remember',
      nextCred: { ...live, version: 4 },
      outcome: null,
      statusKind: 'conflict',
      message: 'Changed elsewhere.',
    },
  );
  assert.deepEqual(resolvePublishResult(live, { ok: false, status: 410, data: null, message: 'Ended.' }), {
    action: 'forget',
    nextCred: null,
    outcome: null,
    statusKind: 'ended',
    message: 'Ended.',
  });
  assert.deepEqual(resolvePublishResult(live, { ok: false, status: 404, data: null, message: 'Missing.' }), {
    action: 'forget',
    nextCred: null,
    outcome: null,
    statusKind: 'deleted',
    message: null,
  });
  // A 404 on an unconfirmed first publish keeps the pending credential for retry.
  assert.deepEqual(resolvePublishResult(first, { ok: false, status: 404, data: null, message: 'Missing.' }), {
    action: 'keep',
    nextCred: first,
    outcome: null,
    statusKind: 'error',
    message: 'Missing.',
  });
  assert.deepEqual(resolvePublishResult(live, { ok: false, status: 503, data: null, message: 'Unavailable.' }), {
    action: 'keep',
    nextCred: live,
    outcome: null,
    statusKind: 'error',
    message: 'Unavailable.',
  });
});

test('classifyGuestLink and resolveGuestLoad handle all five guest link modes and error states', () => {
  const eventId = newId();
  const id = newId();
  const secret = newSecret();

  // 1. View link
  const viewRoute = classifyGuestLink({ eventId, hash: `#v=${id}.${secret}` });
  assert.deepEqual(viewRoute, { kind: 'view', eventId, credential: { id, secret } });
  assert.deepEqual(resolveGuestLoad(viewRoute, { ok: true, status: 200, data: { name: 'Sam' } }), {
    kind: 'view',
    data: { name: 'Sam' },
  });
  assert.deepEqual(resolveGuestLoad(viewRoute, { ok: false, status: 410, message: 'Ended.' }), {
    kind: 'unavailable',
    heading: 'ended',
    message: 'Ended.',
  });

  // 2. Personal link
  const personalRoute = classifyGuestLink({ eventId, hash: `#p=${id}.${secret}` });
  assert.deepEqual(personalRoute, { kind: 'personal', eventId, credential: { id, secret } });
  assert.deepEqual(resolveGuestLoad(personalRoute, { ok: false, status: 404, message: 'Bad link.' }), {
    kind: 'unavailable',
    heading: 'loadFailed',
    message: 'Bad link.',
  });

  // 3. Malformed party credential
  assert.deepEqual(classifyGuestLink({ eventId, hash: '#p=short' }), {
    kind: 'malformedParty',
    eventId,
    prefix: 'p=',
  });
  assert.deepEqual(classifyGuestLink({ eventId, hash: '#v=' }), {
    kind: 'malformedParty',
    eventId,
    prefix: 'v=',
  });

  // 4. Guest-list public link (with and without an old #r= reply edit link)
  const plainRoute = classifyGuestLink({ eventId, hash: '' });
  const editRoute = classifyGuestLink({ eventId, hash: `#r=${id}.${secret}` });
  const guestListData = { t: 'birthday', d: { mode: 'guestList' } };
  assert.deepEqual(resolveGuestLoad(plainRoute, { ok: true, status: 200, data: guestListData }), {
    kind: 'guestListPublic',
    data: guestListData,
    showReplyLinkUnavailable: false,
  });
  assert.deepEqual(resolveGuestLoad(editRoute, { ok: true, status: 200, data: guestListData }), {
    kind: 'guestListPublic',
    data: guestListData,
    showReplyLinkUnavailable: true,
  });

  // 5. Open-mode invitation and reply edit link, plus 404 / 410 / 503 errors
  const openData = { t: 'birthday', d: { mode: 'open' } };
  assert.deepEqual(resolveGuestLoad(plainRoute, { ok: true, status: 200, data: openData }), {
    kind: 'openForm',
    data: openData,
    loadReplyCredential: null,
  });
  assert.deepEqual(resolveGuestLoad(editRoute, { ok: true, status: 200, data: openData }), {
    kind: 'openForm',
    data: openData,
    loadReplyCredential: { id, secret },
  });
  assert.deepEqual(resolveGuestLoad(plainRoute, { ok: false, status: 404, message: 'Missing.' }), {
    kind: 'error',
    heading: 'missing',
    message: 'Missing.',
  });
  assert.deepEqual(resolveGuestLoad(plainRoute, { ok: false, status: 410, message: 'Ended.' }), {
    kind: 'error',
    heading: 'ended',
    message: 'Ended.',
  });
  assert.deepEqual(resolveGuestLoad(plainRoute, { ok: false, status: 503, message: 'Down.' }), {
    kind: 'error',
    heading: 'loadFailed',
    message: 'Down.',
  });

  // Hashchange reload policy
  assert.equal(shouldReloadOnHashChange(plainRoute, '#preview'), false);
  assert.equal(shouldReloadOnHashChange(plainRoute, '#p=abc'), true);
  assert.equal(shouldReloadOnHashChange(plainRoute, '#r=abc'), true);
  assert.equal(shouldReloadOnHashChange(personalRoute, ''), true);
  assert.equal(shouldReloadOnHashChange(editRoute, ''), true);
});
