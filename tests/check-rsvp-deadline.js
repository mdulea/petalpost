// Checks setting, changing and clearing an RSVP deadline, enforcing it in Europe/Bucharest time for guest replies,
// changes and withdrawals in English and Romanian, preserving the deadline across editor updates, and allowing the
// host to edit a party's reply after the deadline while refusing passkey tokens and guest secrets.
// Run: pnpm exec node --test tests/check-rsvp-deadline.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newId, partyLinkSecret } from '../public/js/rsvp.js';
import { guestListEvent, host, party } from './api-setup.js';
import { authenticator } from './passkey-authenticator.js';

const CLOSED_MESSAGE = {
  en: 'Replies are closed because the RSVP deadline has passed.',
  ro: 'Confirmările sunt închise deoarece termenul de confirmare a trecut.',
};

async function guestListSetup(clock, lang = 'en') {
  const {
    client,
    raw,
    cred,
    tracker,
    guests: guest,
    parties,
  } = await guestListEvent({
    options: { now: () => clock.current },
    lang,
    parties: ['Familia Radu'],
  });
  const [{ id: partyId, personal }] = parties;
  return { client, raw, cred, tracker, guest, partyId, personal };
}

test('the host can set, change and clear the deadline, and editor updates preserve it', async () => {
  const clock = { current: new Date('2026-06-10T12:00:00Z') };
  const { cred, tracker } = await guestListSetup(clock);

  const set = await tracker.setDeadline(cred, '2026-06-15');
  assert.deepEqual([set.status, set.data], [200, { deadline: '2026-06-15' }]);
  assert.equal((await tracker.loadResponses(cred)).data.d.deadline, '2026-06-15');

  // Publishing invitation changes from the editor keeps the stored deadline.
  const updated = await tracker.publish(cred, { ...party, d: { ...party.d, mode: 'guestList', title: 'Updated' } });
  assert.equal(updated.status, 200);
  cred.version = updated.data.version;
  assert.equal((await tracker.loadResponses(cred)).data.d.deadline, '2026-06-15');

  const changed = await tracker.setDeadline(cred, '2026-07-01');
  assert.deepEqual([changed.status, changed.data], [200, { deadline: '2026-07-01' }]);

  const cleared = await tracker.setDeadline(cred, null);
  assert.deepEqual([cleared.status, cleared.data], [200, { deadline: null }]);
  assert.equal((await tracker.loadResponses(cred)).data.d.deadline, undefined);
});

test('invalid deadlines, open-mode invitations and passkey sessions are refused', async () => {
  const clock = { current: new Date('2026-06-10T12:00:00Z') };
  const { client, cred, tracker, partyId } = await guestListSetup(clock);

  for (const bad of ['2026-02-30', 'not-a-date', 12345]) {
    assert.equal((await tracker.setDeadline(cred, bad)).status, 400);
  }

  // Open-mode invitations cannot have a deadline.
  const openCred = host();
  assert.equal((await tracker.publish(openCred, party)).status, 201);
  assert.equal((await tracker.setDeadline(openCred, '2026-06-15')).status, 403);

  // Passkey sessions cannot change the deadline or edit a party's reply.
  const key = authenticator();
  const reg = (await tracker.passkeyChallenge(cred)).data;
  assert.equal((await tracker.savePasskey(cred, key.register(reg.challenge))).status, 201);
  const other = client(newId());
  const ch = (await other.signInChallenge()).data;
  const signedIn = await other.signIn(key.signIn(ch.challenge));
  const tokenCred = { id: cred.id, secret: signedIn.data.token };
  assert.equal((await other.setDeadline(tokenCred, '2026-06-15')).status, 403);
  assert.equal(
    (await other.saveHostPartyReply(tokenCred, partyId, { attending: true, partySize: 2, note: '' })).status,
    403,
  );
});

for (const lang of ['en', 'ro']) {
  test(`in ${lang}, guest replies work before the Europe/Bucharest deadline, are refused after, and host edits still work`, async () => {
    // 2026-06-15T20:59:59Z is 2026-06-15 23:59:59 Europe/Bucharest (EEST, UTC+3).
    const clock = { current: new Date('2026-06-15T20:59:59Z') };
    const { cred, tracker, guest, partyId, personal } = await guestListSetup(clock, lang);

    // Without a deadline, replies stay open.
    const secondId = newId();
    assert.equal((await tracker.addParty(cred, secondId, { name: 'Familia Dima', defaultSeats: 2 })).status, 201);
    const second = { id: secondId, secret: await partyLinkSecret(cred.secret, secondId, 'personal') };

    assert.equal((await tracker.setDeadline(cred, '2026-06-15')).status, 200);

    // One second before Bucharest midnight: still open.
    const before = await guest.loadParty(cred.id, personal);
    assert.equal(before.status, 200);
    assert.equal(before.data.deadlineClosed, false);
    const saved = await guest.savePartyReply(cred.id, personal, { attending: true, partySize: 2, note: 'Fără nuci' });
    assert.equal(saved.status, 201);
    personal.version = saved.data.version;
    const edited = await guest.savePartyReply(cred.id, personal, { attending: true, partySize: 3, note: 'Cu desert' });
    assert.equal(edited.status, 200);
    personal.version = edited.data.version;

    // One second later: 2026-06-15T21:00:00Z is 2026-06-16 00:00:00 Europe/Bucharest -> closed.
    clock.current = new Date('2026-06-15T21:00:00Z');
    const after = await guest.loadParty(cred.id, personal);
    assert.equal(after.status, 200);
    assert.equal(after.data.deadlineClosed, true);
    assert.deepEqual(after.data.reply, { attending: true, partySize: 3, note: 'Cu desert', version: personal.version });

    // Refused: new reply, edit existing reply, withdraw existing reply.
    const refusedNew = await guest.savePartyReply(cred.id, second, { attending: true, partySize: 1, note: '' });
    const refusedEdit = await guest.savePartyReply(cred.id, personal, { attending: false, partySize: 0, note: '' });
    const refusedWithdraw = await guest.withdrawPartyReply(cred.id, personal);
    for (const res of [refusedNew, refusedEdit, refusedWithdraw]) {
      assert.equal(res.status, 403);
      assert.equal(res.message, CLOSED_MESSAGE[lang]);
    }
    // Nothing changed in storage.
    assert.equal((await guest.loadParty(cred.id, second)).data.reply, null);
    assert.equal((await guest.loadParty(cred.id, personal)).data.reply.partySize, 3);

    // Guest secret cannot use the host edit endpoint.
    assert.equal(
      (
        await guest.saveHostPartyReply({ id: cred.id, secret: personal.secret }, partyId, {
          attending: false,
          partySize: 0,
          note: '',
          version: personal.version,
        })
      ).status,
      403,
    );

    // Host can still edit an existing reply and record a new reply after the deadline.
    const hostEdit = await tracker.saveHostPartyReply(cred, partyId, {
      attending: true,
      partySize: 4,
      note: 'Updated by phone',
      version: personal.version,
    });
    assert.equal(hostEdit.status, 200);
    // Stale version gets 409.
    assert.equal(
      (
        await tracker.saveHostPartyReply(cred, partyId, {
          attending: false,
          partySize: 0,
          note: '',
          version: personal.version,
        })
      ).status,
      409,
    );
    const hostCreate = await tracker.saveHostPartyReply(cred, secondId, {
      attending: false,
      partySize: 0,
      note: 'Called host',
    });
    assert.equal(hostCreate.status, 201);

    const readAfterHostEdit = await guest.loadParty(cred.id, personal);
    assert.deepEqual(readAfterHostEdit.data.reply, {
      attending: true,
      partySize: 4,
      note: 'Updated by phone',
      version: hostEdit.data.version,
    });

    // Clearing the deadline reopens guest edits and withdrawals.
    assert.equal((await tracker.setDeadline(cred, null)).status, 200);
    personal.version = hostEdit.data.version;
    assert.equal((await guest.loadParty(cred.id, personal)).data.deadlineClosed, false);
    assert.equal((await guest.withdrawPartyReply(cred.id, personal)).status, 204);
    assert.equal((await guest.loadParty(cred.id, personal)).data.reply, null);
  });
}

test('the deadline check follows winter time (EET, UTC+2) in Europe/Bucharest', async () => {
  const clock = { current: new Date('2026-01-15T21:59:59Z') };
  const { cred, tracker, guest, personal } = await guestListSetup(clock);
  assert.equal((await tracker.setDeadline(cred, '2026-01-15')).status, 200);
  assert.equal((await guest.loadParty(cred.id, personal)).data.deadlineClosed, false);
  clock.current = new Date('2026-01-15T22:00:00Z');
  assert.equal((await guest.loadParty(cred.id, personal)).data.deadlineClosed, true);
  assert.equal(
    (await guest.savePartyReply(cred.id, personal, { attending: true, partySize: 1, note: '' })).status,
    403,
  );
});
