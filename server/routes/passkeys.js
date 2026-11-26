// The passkey routes of server/api.js:
//
// POST /api/events/{id}/passkeys/challenge  management secret, no access token; {} gives {challenge}
// POST /api/events/{id}/passkeys            management secret, no access token; {clientDataJSON, attestationObject}
//                                           saves the passkey; 201 {}
// GET  /api/events/{id}/passkeys            management secret or access token; {passkeys: [{id, createdAt}]}
// DELETE /api/events/{id}/passkeys          management secret; {id} removes the passkey if present; 204
// POST /api/passkeys/challenge              public; {} gives {challenge}
// POST /api/passkeys/sign-in                public; {id, clientDataJSON, authenticatorData, signature} gives
//                                           {eventId, token, expiresAt}
//
// A challenge is 32 random bytes in base64url, works once and expires after CHALLENGE_MINUTES. A registration
// challenge belongs to its event, and a sign-in challenge to no event. The WebAuthn fields are base64url, and
// server/webauthn.js checks them against the relying party of the request's own host. An event takes at most
// EVENT_PASSKEYS passkeys. A sign-in returns an access token that the management routes accept in place of the
// management secret for TOKEN_MINUTES; the database keeps only its hash, and a sign-in deletes the tokens that
// expired over a day before. Every failed WebAuthn check gets the same
// 400, and a passkey that no invitation has, such as one of a deleted invitation, gets a 404.
import { randomBytes } from 'node:crypto';
import { verifyRegistration, verifySignIn } from '../webauthn.js';
import { bearer, hash, json, ownedEvent, readBody, Refusal } from './shared.js';

export const CHALLENGE_MINUTES = 5;
export const TOKEN_MINUTES = 60;
export const EVENT_PASSKEYS = 20;

export const routes = [
  { pattern: /^\/api\/events\/([^/]+)\/passkeys\/challenge$/, methods: { POST: registrationChallenge } },
  {
    pattern: /^\/api\/events\/([^/]+)\/passkeys$/,
    methods: { GET: listPasskeys, POST: savePasskey, DELETE: removePasskey },
  },
  { pattern: /^\/api\/passkeys\/challenge$/, methods: { POST: signInChallenge } },
  { pattern: /^\/api\/passkeys\/sign-in$/, methods: { POST: signIn } },
];

const BASE64URL = /^[A-Za-z0-9_-]{1,8000}$/;

// The relying party of the request: its host name, and its origin under https or its own scheme.
function relyingParty(request) {
  const url = new URL(request.url);
  return { id: url.hostname, origins: [url.origin, `https://${url.host}`] };
}

// The result of verify over the named base64url body fields as Buffers, or the 400 passkey Refusal for a field
// that is not base64url and for every failed WebAuthn check.
function verifyFields(body, names, verify) {
  try {
    const fields = {};
    for (const name of names) {
      if (!BASE64URL.test(body[name])) throw new Error(name);
      fields[name] = Buffer.from(body[name], 'base64url');
    }
    return verify(fields);
  } catch {
    throw new Refusal(400, 'passkey');
  }
}

async function issueChallenge(db, eventId) {
  const challenge = randomBytes(32).toString('base64url');
  await db.query('delete from passkey_challenges where expires_at <= now()', []);
  await db.query(
    `insert into passkey_challenges (challenge, event_id, expires_at)
     values ($1, $2, now() + make_interval(mins => $3))`,
    [challenge, eventId, CHALLENGE_MINUTES],
  );
  return json(200, { challenge });
}

// Removes the unexpired challenge of the event, or of no event when eventId is null, or refuses.
async function consumeChallenge(tx, challenge, eventId) {
  const { rows } = await tx.query(
    `delete from passkey_challenges where challenge = $1 and event_id is not distinct from $2 and expires_at > now()
     returning 1`,
    [challenge, eventId],
  );
  if (!rows.length) throw new Refusal(400, 'passkey');
}

async function registrationChallenge({ db, request, ids: [id] }) {
  const secret = bearer(request);
  await readBody(request);
  await ownedEvent(db, id, secret, { lock: false, token: false });
  return issueChallenge(db, id);
}

async function savePasskey({ db, request, ids: [id] }) {
  const secret = bearer(request);
  const body = await readBody(request);
  return db.transaction(async (tx) => {
    await ownedEvent(tx, id, secret, { token: false });
    const passkey = verifyFields(body, ['clientDataJSON', 'attestationObject'], (fields) =>
      verifyRegistration(fields, relyingParty(request)),
    );
    await consumeChallenge(tx, passkey.challenge, id);
    const { count } = (await tx.query('select count(*)::int as count from passkeys where event_id = $1', [id])).rows[0];
    if (count >= EVENT_PASSKEYS) throw new Refusal(429, 'eventPasskeys');
    // A credential id that is already saved keeps its row, so a submitted id never moves a passkey to another event.
    await tx.query(
      `insert into passkeys (id, event_id, public_key, sign_count) values ($1, $2, $3, $4)
       on conflict (id) do nothing`,
      [passkey.credentialId, id, passkey.publicKey, passkey.signCount],
    );
    return json(201, {});
  });
}

// Returns only the credential IDs and save dates, in save order, to a host with management access.
async function listPasskeys({ db, request, ids: [id] }) {
  const secret = bearer(request);
  return db.transaction(async (tx) => {
    await ownedEvent(tx, id, secret, { lock: 'key share' });
    const { rows } = await tx.query('select id, created_at from passkeys where event_id = $1 order by created_at, id', [
      id,
    ]);
    return json(200, {
      passkeys: rows.map((row) => ({ id: row.id, createdAt: new Date(row.created_at).toISOString() })),
    });
  });
}

// Removes the credential only from this invitation and only with its management secret.
async function removePasskey({ db, request, ids: [id] }) {
  const secret = bearer(request);
  const { id: credentialId } = await readBody(request);
  if (typeof credentialId !== 'string' || !BASE64URL.test(credentialId)) throw new Refusal(400, 'passkey');
  return db.transaction(async (tx) => {
    // Sign-in also needs a key-share lock on the invitation when it writes the access token.
    await ownedEvent(tx, id, secret, { lock: 'key share', token: false });
    await tx.query('delete from passkeys where event_id = $1 and id = $2', [id, credentialId]);
    return json(204, null);
  });
}

async function signInChallenge({ db, request }) {
  await readBody(request);
  return issueChallenge(db, null);
}

async function signIn({ db, request }) {
  const body = await readBody(request);
  if (typeof body.id !== 'string' || !BASE64URL.test(body.id)) throw new Refusal(400, 'passkey');
  return db.transaction(async (tx) => {
    const passkey = (
      await tx.query('select event_id, public_key, sign_count from passkeys where id = $1 for update', [body.id])
    ).rows[0];
    if (!passkey) throw new Refusal(404, 'passkeyMissing');
    const { challenge, signCount } = verifyFields(
      body,
      ['clientDataJSON', 'authenticatorData', 'signature'],
      (fields) => verifySignIn(fields, passkey.public_key, relyingParty(request)),
    );
    await consumeChallenge(tx, challenge, null);
    // A synced passkey always reports 0. A counter that stops rising otherwise means a copied authenticator.
    const stored = Number(passkey.sign_count);
    if ((signCount > 0 || stored > 0) && signCount <= stored) throw new Refusal(400, 'passkey');
    await tx.query('update passkeys set sign_count = $2 where id = $1', [body.id, signCount]);
    const token = randomBytes(32).toString('base64url');
    await tx.query("delete from access_tokens where expires_at < now() - interval '1 day'", []);
    const { expires_at } = (
      await tx.query(
        `insert into access_tokens (token_hash, event_id, expires_at)
         values ($1, $2, now() + make_interval(mins => $3)) returning expires_at`,
        [hash(token), passkey.event_id, TOKEN_MINUTES],
      )
    ).rows[0];
    return json(200, { eventId: passkey.event_id, token, expiresAt: new Date(expires_at).toISOString() });
  });
}
