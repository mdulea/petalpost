// Fails when passkey registration, passkey sign-in or its access token break. Checks: an ES256 and an RS256 passkey
// saved with the management secret sign in and get a token for their own invitation; the token loads the replies,
// publishes changes and deletes the invitation, and the sign-in link round trip; a token reaches no other invitation,
// cannot ask for a registration challenge or save a passkey, and gets a 401 after it expires; a challenge works once,
// belongs to its own invitation or to sign-in, and expires; refusals of a wrong origin, relying party, type, missing
// user verification, signature, sign counter that stops rising, malformed fields and an unknown passkey; the
// passkey limit per invitation; deleting the invitation deletes its passkeys and tokens, and its passkey then opens
// nothing; no response contains a stored hash or public key, and all are no-store.
// Each test uses the shared migrated in-memory PGlite database of tests/api-setup.js with fresh ids.
// Run: pnpm exec node tests/check-passkeys.js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { readCredential, signedInLink } from '../public/js/rsvp.js';
import { EVENT_PASSKEYS } from '../server/routes/passkeys.js';
import { host, party, publishedEvent } from './api-setup.js';
import { authenticator } from './passkey-authenticator.js';

const sha256 = (text) => createHash('sha256').update(text).digest('hex');

// A published invitation with a passkey saved through its management secret.
async function withPasskey(alg) {
  const event = await publishedEvent();
  const key = authenticator(alg);
  const owner = event.client();
  const { data } = await owner.passkeyChallenge(event.cred);
  const saved = await owner.savePasskey(event.cred, key.register(data.challenge));
  assert.equal(saved.status, 201, saved.message);
  return { ...event, key };
}

// Signs in from a browser without credentials and gives the result.
async function signIn(guests, key, options) {
  const { data } = await guests.signInChallenge();
  return guests.signIn(key.signIn(data.challenge, options));
}

for (const [label, alg] of [
  ['ES256', -7],
  ['RS256', -257],
]) {
  test(`an ${label} passkey signs in to its own invitation`, async () => {
    const { cred, guests, key } = await withPasskey(alg);
    const result = await signIn(guests, key);
    assert.equal(result.status, 200, result.message);
    assert.equal(result.data.eventId, cred.id);
    const minutes = (Date.parse(result.data.expiresAt) - Date.now()) / 60000;
    assert.ok(minutes > 59 && minutes <= 60, `expires in ${minutes} minutes`);
    const replies = await guests.loadResponses({ id: cred.id, secret: result.data.token });
    assert.equal(replies.status, 200, replies.message);
    assert.equal(replies.data.d.title, party.d.title);
  });
}

test('the sign-in link carries the access token back to the management page', () => {
  const link = signedInLink('https://www.petalpost.ro', 'a'.repeat(22), 'b'.repeat(43), 'ro');
  assert.equal(link, `https://www.petalpost.ro/ro/manage.html#t=${'a'.repeat(22)}.${'b'.repeat(43)}`);
  assert.deepEqual(readCredential(link.slice(link.indexOf('#')), 't='), { id: 'a'.repeat(22), secret: 'b'.repeat(43) });
  assert.equal(readCredential(link.slice(link.indexOf('#')), ''), null);
});

test('an access token publishes changes and deletes its invitation', async () => {
  const { cred, guests, key } = await withPasskey();
  const { data } = await signIn(guests, key);
  const tokenCred = { id: cred.id, secret: data.token, version: 1 };
  const changed = await guests.publish(tokenCred, { t: party.t, d: { ...party.d, title: 'Changed by token' } });
  assert.equal(changed.status, 200, changed.message);
  assert.equal((await guests.loadEvent(cred.id)).data.d.title, 'Changed by token');
  assert.equal((await guests.deleteEvent(tokenCred)).status, 204);
  assert.equal((await guests.loadEvent(cred.id)).status, 404);
});

test('an access token reaches no other invitation and cannot save passkeys', async () => {
  const { cred, client, guests, key } = await withPasskey();
  const other = host();
  await client().publish(other, party);
  const { data } = await signIn(guests, key);
  const elsewhere = await guests.loadResponses({ id: other.id, secret: data.token });
  assert.equal(elsewhere.status, 403);
  const tokenCred = { id: cred.id, secret: data.token };
  assert.equal((await guests.passkeyChallenge(tokenCred)).status, 403);
  const { data: fresh } = await client().passkeyChallenge(cred);
  const saved = await guests.savePasskey(tokenCred, authenticator().register(fresh.challenge));
  assert.equal(saved.status, 403);
});

test('an expired access token gets a 401 and loads nothing', async () => {
  const { db, cred, guests, key } = await withPasskey();
  const { data } = await signIn(guests, key);
  await db.query("update access_tokens set expires_at = now() - interval '1 second' where token_hash = $1", [
    sha256(data.token),
  ]);
  const result = await guests.loadResponses({ id: cred.id, secret: data.token });
  assert.equal(result.status, 401);
  assert.match(result.message, /expired/);
  assert.equal(result.data.responses, undefined);
});

test('a challenge works once, for its own purpose, until it expires', async () => {
  const { db, cred, client, guests, key } = await withPasskey();
  const { data } = await guests.signInChallenge();
  assert.equal((await guests.signIn(key.signIn(data.challenge))).status, 200);
  assert.equal((await guests.signIn(key.signIn(data.challenge, { signCount: 0 }))).status, 400);

  const { data: registration } = await client().passkeyChallenge(cred);
  assert.equal((await guests.signIn(key.signIn(registration.challenge))).status, 400);

  const other = host();
  await client().publish(other, party);
  const otherSaved = await client().savePasskey(other, authenticator().register(registration.challenge));
  assert.equal(otherSaved.status, 400);

  const { data: late } = await guests.signInChallenge();
  await db.query("update passkey_challenges set expires_at = now() - interval '1 second' where challenge = $1", [
    late.challenge,
  ]);
  assert.equal((await guests.signIn(key.signIn(late.challenge))).status, 400);
});

test('a registration that fails a WebAuthn check saves nothing', async () => {
  const { cred, client, guests } = await publishedEvent();
  const cases = {
    'another origin': { origin: 'https://evil.test' },
    'another relying party': { rpId: 'evil.test' },
    'a sign-in type': { type: 'webauthn.get' },
    'no user verification': { flags: 0x01 },
  };
  for (const [label, options] of Object.entries(cases)) {
    const key = authenticator();
    const { data } = await client().passkeyChallenge(cred);
    const saved = await client().savePasskey(cred, key.register(data.challenge, options));
    assert.equal(saved.status, 400, label);
    assert.equal((await signIn(guests, key)).status, 404, label);
  }
  for (const body of [{}, { clientDataJSON: 'e30', attestationObject: 'oA' }, { clientDataJSON: 1 }]) {
    assert.equal((await client().savePasskey(cred, body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await client().savePasskey({ id: cred.id, secret: host().secret }, {})).status, 403);
  assert.equal((await guests.passkeyChallenge({ id: cred.id, secret: host().secret })).status, 403);
});

test('a sign-in that fails a WebAuthn check gets no token', async () => {
  const { guests, key } = await withPasskey();
  const cases = {
    'another origin': { origin: 'https://evil.test' },
    'another relying party': { rpId: 'evil.test' },
    'a registration type': { type: 'webauthn.create' },
    'no user verification': { flags: 0x01 },
  };
  for (const [label, options] of Object.entries(cases)) {
    const result = await signIn(guests, key, options);
    assert.equal(result.status, 400, label);
    assert.equal(result.data.token, undefined, label);
  }
  const { data } = await guests.signInChallenge();
  const forged = { ...key.signIn(data.challenge), signature: authenticator().signIn(data.challenge).signature };
  assert.equal((await guests.signIn(forged)).status, 400);
  assert.equal((await guests.signIn({ ...key.signIn(data.challenge), id: 'not base64url!' })).status, 400);
  assert.equal((await guests.signIn({ ...key.signIn(data.challenge), signature: undefined })).status, 400);
  assert.equal((await signIn(guests, authenticator())).status, 404);
});

test('a sign counter that stops rising is refused', async () => {
  const { guests, key } = await withPasskey();
  assert.equal((await signIn(guests, key, { signCount: 5 })).status, 200);
  assert.equal((await signIn(guests, key, { signCount: 5 })).status, 400);
  assert.equal((await signIn(guests, key, { signCount: 0 })).status, 400);
  assert.equal((await signIn(guests, key, { signCount: 6 })).status, 200);
});

test(`an invitation takes at most ${EVENT_PASSKEYS} passkeys`, async () => {
  const { cred, client } = await withPasskey();
  for (let i = 1; i < EVENT_PASSKEYS; i += 1) {
    const { data } = await client().passkeyChallenge(cred);
    assert.equal((await client().savePasskey(cred, authenticator().register(data.challenge))).status, 201);
  }
  const { data } = await client().passkeyChallenge(cred);
  const full = await client().savePasskey(cred, authenticator().register(data.challenge));
  assert.equal(full.status, 429);
  assert.match(full.message, new RegExp(`${EVENT_PASSKEYS} passkeys`));
});

test('deleting the invitation deletes its passkeys and tokens', async () => {
  const { db, cred, client, guests, key } = await withPasskey();
  const { data } = await signIn(guests, key);
  assert.equal((await client().deleteEvent(cred)).status, 204);
  const left = await db.query(
    `select (select count(*)::int from passkeys where event_id = $1) as passkeys,
            (select count(*)::int from access_tokens where event_id = $1) as tokens`,
    [cred.id],
  );
  assert.deepEqual(left.rows[0], { passkeys: 0, tokens: 0 });
  const result = await signIn(guests, key);
  assert.equal(result.status, 404);
  assert.match(result.message, /deleted/);
  assert.equal((await guests.loadResponses({ id: cred.id, secret: data.token })).status, 404);
});

test('passkey responses hold no stored hash or public key and are no-store', async () => {
  const { db, cred, raw, key } = await withPasskey();
  const stored = (await db.query('select public_key from passkeys where event_id = $1', [cred.id])).rows[0];
  const post = (path, body, secret) =>
    raw(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(secret ? { authorization: `Bearer ${secret}` } : {}) },
      body: JSON.stringify(body),
    });
  const challenge = await post('/api/passkeys/challenge', {});
  const { challenge: value } = await challenge.clone().json();
  const signedIn = await post('/api/passkeys/sign-in', key.signIn(value));
  const { token } = await signedIn.clone().json();
  const registration = await post(`/api/events/${cred.id}/passkeys/challenge`, {}, cred.secret);
  for (const response of [challenge, signedIn, registration]) {
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const text = await response.text();
    for (const secret of [stored.public_key, sha256(token), sha256(cred.secret), cred.secret]) {
      assert.ok(!text.includes(secret), text);
    }
  }
});
