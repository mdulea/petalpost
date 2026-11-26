// Checks party creation, personal access, one versioned reply, and withdrawal through the API in both languages.
// Checks that revoking or regenerating a link blocks old guest access and keeps replies and tracker totals.
// A passkey session can read the guest list. Adding parties and changing links need the management secret.
// Run: pnpm exec node --test tests/check-personal-link.js
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { test } from 'node:test';
import { newId, partyLinkSecret } from '../public/js/rsvp.js';
import { host, party, setup } from './api-setup.js';
import { authenticator } from './passkey-authenticator.js';

const hash = (secret) => createHash('sha256').update(secret).digest('hex');

test('a passkey session reads the guest list but cannot create parties or change their links', async () => {
  const { client } = await setup();
  const cred = host();
  const owner = client();
  const other = client(newId());
  await owner.publish(cred, { ...party, d: { ...party.d, mode: 'guestList' } });
  const id = newId();
  assert.equal((await owner.addParty(cred, id, { name: 'Sam', defaultSeats: 2 })).status, 201);
  const key = authenticator();
  const registration = (await owner.passkeyChallenge(cred)).data;
  assert.equal((await owner.savePasskey(cred, key.register(registration.challenge))).status, 201);
  const challenge = (await other.signInChallenge()).data;
  const signedIn = await other.signIn(key.signIn(challenge.challenge));
  assert.equal(signedIn.status, 200);
  const tokenCred = { id: cred.id, secret: signedIn.data.token };
  const refused = await other.addParty(tokenCred, newId(), { name: 'Lee', defaultSeats: 3 });
  assert.equal((await other.changePartyLink(tokenCred, id, true)).status, 403);
  assert.equal((await other.changePartyLink(tokenCred, id, false)).status, 403);
  const list = await other.loadResponses(tokenCred);
  assert.deepEqual(
    { refused: refused.status, read: list.status, names: list.data.parties.map(({ name }) => name) },
    { refused: 403, read: 200, names: ['Sam'] },
  );
});

for (const lang of ['en', 'ro']) {
  test(`in ${lang}, revoking a personal link keeps the party's reply and tracker totals`, async () => {
    const { client } = await setup();
    const cred = host();
    const tracker = client(newId(), lang);
    const guest = client(newId(), lang);
    await tracker.publish(cred, { ...party, d: { ...party.d, mode: 'guestList' } });
    const id = newId();
    await tracker.addParty(cred, id, { name: 'Familia Radu', defaultSeats: 3 });
    const personal = {
      id,
      secret: createHmac('sha256', cred.secret).update(`petalpost:personal:${id}`).digest('base64url'),
    };
    const answer = { attending: true, partySize: 2, note: 'Fără nuci' };
    const saved = await guest.savePartyReply(cred.id, personal, answer);
    assert.equal(saved.status, 201);
    personal.version = saved.data.version;
    const before = (await tracker.loadResponses(cred)).data;
    assert.equal((await guest.changePartyLink({ id: cred.id, secret: personal.secret }, id, true)).status, 403);
    assert.equal((await tracker.changePartyLink(cred, id, true)).status, 204);
    const unavailable =
      lang === 'en'
        ? 'This link no longer works. Ask the host for a new one.'
        : 'Acest link nu mai funcționează. Cere-i gazdei un link nou.';
    for (const result of [
      await guest.loadParty(cred.id, personal),
      await guest.savePartyReply(cred.id, personal, answer),
      await guest.withdrawPartyReply(cred.id, personal),
    ]) {
      assert.equal(result.status, 404);
      assert.deepEqual(result.data, { error: unavailable });
    }
    const after = (await tracker.loadResponses(cred)).data;
    assert.equal(after.parties[0].revoked, true);
    assert.deepEqual(after.parties[0].reply, before.parties[0].reply);
    assert.deepEqual(after.totals, before.totals);
  });

  test(`in ${lang}, a regenerated link can edit an earlier reply or start a new reply`, async () => {
    const { client } = await setup();
    const cred = host();
    const tracker = client(newId(), lang);
    const guest = client(newId(), lang);
    await tracker.publish(cred, { ...party, d: { ...party.d, mode: 'guestList' } });
    const answer = { attending: true, partySize: 2, note: 'Fără nuci' };
    for (const hadReply of [true, false]) {
      const id = newId();
      await tracker.addParty(cred, id, { name: hadReply ? 'Familia Radu' : 'Familia Dima', defaultSeats: 3 });
      const old = { id, secret: await partyLinkSecret(cred.secret, id, 'personal') };
      if (hadReply) assert.equal((await guest.savePartyReply(cred.id, old, answer)).status, 201);
      const before = (await tracker.loadResponses(cred)).data;
      if (hadReply) assert.equal((await tracker.changePartyLink(cred, id, true)).status, 204);
      assert.equal((await tracker.changePartyLink(cred, id, false)).status, 204);
      const after = (await tracker.loadResponses(cred)).data;
      const entry = after.parties.find((entry) => entry.id === id);
      assert.equal(entry.revoked, false);
      assert.deepEqual(after.totals, before.totals);
      assert.deepEqual(entry.reply, before.parties.find((entry) => entry.id === id).reply);
      const secret = await partyLinkSecret(cred.secret, id, 'personal', entry.linkGeneration);
      assert.notEqual(secret, old.secret);
      const newLink = { id, secret };
      const earlier = await guest.loadParty(cred.id, newLink);
      assert.equal(earlier.status, 200);
      assert.deepEqual(earlier.data.reply, hadReply ? { ...answer, version: 2 } : null);
      assert.equal((await guest.loadParty(cred.id, old)).status, 404);
      newLink.version = earlier.data.reply?.version;
      const changed = { attending: false, partySize: 0, note: 'Noi planuri' };
      assert.equal((await guest.savePartyReply(cred.id, newLink, changed)).status, hadReply ? 200 : 201);
    }
  });

  test(`in ${lang}, each party can manage only its own reply through its personal link`, async () => {
    const { client, raw } = await setup();
    const cred = host();
    const tracker = client(newId(), lang);
    await tracker.publish(cred, { ...party, d: { ...party.d, mode: 'guestList' } });
    const root = `/api/events/${cred.id}/parties`;
    const request = async (path, secret, method = 'GET', body = undefined) => {
      const response = await raw(path, {
        method,
        headers: { authorization: `Bearer ${secret}`, 'accept-language': lang },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const text = await response.text();
      for (const value of credentials) assert.ok(!text.includes(value) && !text.includes(hash(value)));
      return { status: response.status, data: text ? JSON.parse(text) : null };
    };
    const guestFor = (id) => ({
      id,
      secret: createHmac('sha256', cred.secret).update(`petalpost:personal:${id}`).digest('base64url'),
      view: createHmac('sha256', cred.secret).update(`petalpost:view:${id}`).digest('base64url'),
    });
    const a = guestFor(newId());
    const b = guestFor(newId());
    const credentials = [cred.secret, a.secret, a.view, b.secret, b.view];
    for (const { guest, name } of [
      { guest: a, name: 'Familia Radu' },
      { guest: b, name: 'Familia Dima' },
    ]) {
      const result = await request(`${root}/${guest.id}`, cred.secret, 'PUT', {
        name,
        defaultSeats: 3,
        lang,
      });
      assert.equal(result.status, 201);
    }
    const path = `${root}/${a.id}`;
    const personal = await request(path, a.secret);
    assert.deepEqual(
      [personal.status, personal.data.name, personal.data.defaultSeats, personal.data.reply],
      [200, 'Familia Radu', 3, null],
    );
    const refused = await request(path, b.secret);
    assert.deepEqual(refused, {
      status: 404,
      data: {
        error:
          lang === 'en'
            ? 'This link no longer works. Ask the host for a new one.'
            : 'Acest link nu mai funcționează. Cere-i gazdei un link nou.',
      },
    });
    const answer = { attending: true, partySize: 2, note: 'Fără nuci' };
    assert.equal((await request(path, b.secret, 'PATCH', answer)).status, 404);
    assert.equal((await request(path, a.view)).status, 404);
    const wrongInvitation = `/api/events/${newId()}/parties/${a.id}`;
    assert.equal((await request(wrongInvitation, a.secret)).status, 404);
    const attempts = await Promise.all([
      request(path, a.secret, 'PATCH', answer),
      request(path, a.secret, 'PATCH', answer),
    ]);
    assert.deepEqual(attempts.map(({ status }) => status).sort(), [201, 409]);
    const saved = (await request(path, a.secret)).data.reply;
    const changed = await request(path, a.secret, 'PATCH', {
      attending: false,
      partySize: 0,
      note: 'Noi planuri',
      version: saved.version,
    });
    assert.equal(changed.status, 200);
    const list = await request(`/api/events/${cred.id}/responses`, cred.secret);
    assert.deepEqual(
      list.data.parties.map(({ name, reply }) => [name, reply?.attending, reply?.partySize, reply?.note]),
      [
        ['Familia Radu', false, 0, 'Noi planuri'],
        ['Familia Dima', undefined, undefined, undefined],
      ],
    );
    assert.equal((await request(path, a.secret, 'DELETE', { version: changed.data.version })).status, 204);
    assert.equal((await request(path, a.secret)).data.reply, null);
    assert.equal((await request(path, a.secret, 'PATCH', answer)).status, 201);
    assert.equal((await request(path, a.secret, 'DELETE', { version: changed.data.version })).status, 409);
  });
}
