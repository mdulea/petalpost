// A software authenticator for the passkey API checks. authenticator(alg?) holds one passkey with a fresh key pair of
// the COSE algorithm, -7 for ES256 or -257 for RS256, and gives the base64url bodies that the page sends:
// register(challenge, options?) for POST /api/events/{id}/passkeys and signIn(challenge, options?) for
// POST /api/passkeys/sign-in. options override the parts that the refusal checks change: origin, rpId, type, flags
// and signCount. The relying party is the host of tests/api-setup.js.
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';

const ORIGIN = 'http://petalpost.test';
const RP_ID = 'petalpost.test';
const UP_UV = 0x05;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest();
const b64 = (bytes) => Buffer.from(bytes).toString('base64url');

// CBOR of integers, byte strings, text strings and Maps, as authenticators write them.
function cbor(value) {
  const head = (major, n) =>
    n < 24
      ? Buffer.from([(major << 5) | n])
      : n < 256
        ? Buffer.from([(major << 5) | 24, n])
        : Buffer.from([(major << 5) | 25, n >> 8, n & 255]);
  if (typeof value === 'number') return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (Buffer.isBuffer(value)) return Buffer.concat([head(2, value.length), value]);
  if (typeof value === 'string') return Buffer.concat([head(3, Buffer.byteLength(value)), Buffer.from(value)]);
  return Buffer.concat([head(5, value.size), ...[...value].flatMap(([k, v]) => [cbor(k), cbor(v)])]);
}

/** @typedef {{origin?: string, rpId?: string, type?: string, flags?: number, signCount?: number}} Options */

// A CBOR map of [key, value] entries of mixed types.
const pairs = (entries) => new Map(/** @type {[any, any][]} */ (entries));

export function authenticator(alg = -7) {
  const { privateKey, publicKey } =
    alg === -7
      ? generateKeyPairSync('ec', { namedCurve: 'P-256' })
      : generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = publicKey.export({ format: 'jwk' });
  const part = (name) => Buffer.from(jwk[name], 'base64url');
  const cose =
    alg === -7
      ? pairs([
          [1, 2],
          [3, alg],
          [-1, 1],
          [-2, part('x')],
          [-3, part('y')],
        ])
      : pairs([
          [1, 3],
          [3, alg],
          [-1, part('n')],
          [-2, part('e')],
        ]);
  const credentialId = randomBytes(16);
  const clientData = (type, challenge, origin = ORIGIN) =>
    Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  const authData = ({ rpId = RP_ID, flags = UP_UV, signCount = 0 }, attested) => {
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(signCount);
    const head = Buffer.concat([sha256(rpId), Buffer.from([flags | (attested ? 0x40 : 0)]), counter]);
    if (!attested) return head;
    const length = Buffer.from([credentialId.length >> 8, credentialId.length & 255]);
    return Buffer.concat([head, Buffer.alloc(16), length, credentialId, cbor(cose)]);
  };
  return {
    id: b64(credentialId),
    /** @param {string} challenge @param {Options} [options] */
    register(challenge, { type = 'webauthn.create', origin, ...options } = {}) {
      const attestation = pairs([
        ['fmt', 'none'],
        ['attStmt', new Map()],
        ['authData', authData(options, true)],
      ]);
      return { clientDataJSON: b64(clientData(type, challenge, origin)), attestationObject: b64(cbor(attestation)) };
    },
    /** @param {string} challenge @param {Options} [options] */
    signIn(challenge, { type = 'webauthn.get', origin, ...options } = {}) {
      const data = clientData(type, challenge, origin);
      const auth = authData(options, false);
      const signature = sign('sha256', Buffer.concat([auth, sha256(data)]), privateKey);
      return {
        id: b64(credentialId),
        clientDataJSON: b64(data),
        authenticatorData: b64(auth),
        signature: b64(signature),
      };
    },
  };
}
