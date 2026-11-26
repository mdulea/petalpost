// Checks party creation, personal access, one versioned reply, and withdrawal through the API in both languages.
// Run: pnpm exec node --test tests/check-personal-link.js
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { test } from 'node:test';
import { newId } from '../public/js/rsvp.js';
import { host, party, setup } from './api-setup.js';

const hash = (secret) => createHash('sha256').update(secret).digest('hex');

for (const lang of ['en', 'ro']) {
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
