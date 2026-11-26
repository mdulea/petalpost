// Checks read-only view links, rejection of view secrets by the reply API, and invalidation on revocation or personal link regeneration in both languages.
// Checks that batch-created parties have working view links before their personal links are opened.
// Run: pnpm exec node --test tests/check-view-link.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newId, partyLinkSecret, viewLinkSecret } from '../public/js/rsvp.js';
import { host, party, setup } from './api-setup.js';

test('a batch stores a working view link for each party before any personal link is opened', async () => {
  const { client } = await setup();
  const cred = host();
  const owner = client();
  const entries = ['Sam', 'Radu'].map((name) => ({ id: newId(), name }));
  await owner.publish(cred, { ...party, d: { ...party.d, mode: 'guestList' } });
  assert.equal((await owner.addParties(cred, entries, 2)).ok, true);
  for (const { id, name } of entries) {
    const personal = await partyLinkSecret(cred.secret, id, 'personal');
    const secret = await viewLinkSecret(personal, id);
    const page = await owner.loadPartyView(cred.id, { id, secret });
    assert.equal(page.status, 200);
    assert.equal(page.data.name, name);
  }
});

for (const lang of ['en', 'ro']) {
  test(`in ${lang}, a view link reads only the invitation and greeting and stops working after revoke or regeneration`, async () => {
    const { client, raw } = await setup();
    const cred = host();
    const owner = client(newId(), lang);
    const id = newId();
    const personal = { id, secret: await partyLinkSecret(cred.secret, id, 'personal') };
    const view = await viewLinkSecret(personal.secret, id);
    const unavailable = {
      error:
        lang === 'en'
          ? 'This link no longer works. Ask the host for a new one.'
          : 'Acest link nu mai funcționează. Cere-i gazdei un link nou.',
    };

    await owner.publish(cred, { ...party, d: { ...party.d, mode: 'guestList' } });
    await owner.addParty(cred, id, { name: 'Familia Radu', defaultSeats: 2 });
    const reply = { attending: true, partySize: 2, note: 'Fără nuci' };
    const saved = await owner.savePartyReply(cred.id, personal, reply);
    assert.equal(saved.status, 201);

    const path = `/api/events/${cred.id}/parties/${id}`;
    const page = await raw(`${path}/view`, { headers: { authorization: `Bearer ${view}` } });
    assert.equal(page.status, 200);
    assert.equal(page.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await page.json(), {
      t: party.t,
      d: (await owner.loadEvent(cred.id)).data.d,
      name: 'Familia Radu',
    });

    const viewer = { id, secret: view, version: saved.data.version };
    for (const result of [
      await owner.loadParty(cred.id, viewer),
      await owner.savePartyReply(cred.id, viewer, { ...reply, note: 'Changed' }),
      await owner.withdrawPartyReply(cred.id, viewer),
    ]) {
      assert.deepEqual(result.data, unavailable);
      assert.equal(result.status, 404);
    }
    assert.deepEqual((await owner.loadParty(cred.id, personal)).data.reply, { ...reply, version: saved.data.version });

    assert.equal((await owner.changePartyLink(cred, id, 'revoke')).status, 204);
    const revoked = await owner.loadPartyView(cred.id, viewer);
    assert.equal(revoked.status, 404);
    assert.deepEqual(revoked.data, unavailable);

    assert.equal((await owner.changePartyLink(cred, id, 'regenerate')).status, 204);
    const stale = await owner.loadPartyView(cred.id, viewer);
    assert.equal(stale.status, 404);
    assert.deepEqual(stale.data, unavailable);

    const generation = (await owner.loadResponses(cred)).data.parties[0].linkGeneration;
    const replacement = { id, secret: await partyLinkSecret(cred.secret, id, 'personal', generation) };
    const nextView = { id, secret: await viewLinkSecret(replacement.secret, id) };
    const refreshed = await owner.loadPartyView(cred.id, nextView);
    assert.equal(refreshed.status, 200);
    assert.equal(refreshed.data.name, 'Familia Radu');
    assert.equal('reply' in refreshed.data, false);
  });
}
