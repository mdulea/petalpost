// The WebAuthn checks of the passkey routes, written on node:crypto so the server needs no WebAuthn dependency.
// It verifies a passkey registration and a sign-in for the ES256 and RS256 algorithms, which the registration
// options offer. It checks no attestation statement, which matches the attestation 'none' that the page requests:
// the management secret, not the authenticator's maker, decides who may save a passkey.
// rp is {id, origins}: the relying party id that the authenticator hashed, and the page origins that the browser may
// report. Every check throws an Error on input that fails it; the routes turn that into one refusal.
import { createHash, createPublicKey, verify } from 'node:crypto';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest();

// The COSE algorithm ids that public/js/passkey.js offers.
const ES256 = -7;
const RS256 = -257;

// The CBOR value at offset at and the offset after it, for the subset that authenticators write: integers, byte and
// text strings, arrays, maps, false, true and null. Maps become Map objects, so integer keys stay integers.
function decodeCbor(bytes, at = 0, depth = 0) {
  if (depth > 8 || at >= bytes.length) throw new Error('cbor');
  const major = bytes[at] >> 5;
  const info = bytes[at] & 31;
  let next = at + 1;
  let n = info;
  if (info === 24) [n, next] = [bytes.readUInt8(next), next + 1];
  else if (info === 25) [n, next] = [bytes.readUInt16BE(next), next + 2];
  else if (info === 26) [n, next] = [bytes.readUInt32BE(next), next + 4];
  else if (info > 26) throw new Error('cbor');
  if (major === 0) return [n, next];
  if (major === 1) return [-1 - n, next];
  if (major === 2 || major === 3) {
    if (next + n > bytes.length) throw new Error('cbor');
    const slice = bytes.subarray(next, next + n);
    return [major === 2 ? slice : slice.toString('utf8'), next + n];
  }
  if (major === 4) {
    const items = [];
    for (let i = 0; i < n; i += 1) {
      let item;
      [item, next] = decodeCbor(bytes, next, depth + 1);
      items.push(item);
    }
    return [items, next];
  }
  if (major === 5) {
    const entries = new Map();
    for (let i = 0; i < n; i += 1) {
      let key, value;
      [key, next] = decodeCbor(bytes, next, depth + 1);
      [value, next] = decodeCbor(bytes, next, depth + 1);
      entries.set(key, value);
    }
    return [entries, next];
  }
  const simple = { 20: false, 21: true, 22: null };
  if (major === 7 && info in simple) return [simple[info], next];
  throw new Error('cbor');
}

// The parts of authenticator data, after checking the relying party id hash and that the user was present and
// verified. With attested credential data, it also gives the credential id and the COSE public key bytes.
function readAuthData(bytes, rp) {
  if (bytes.length < 37 || !bytes.subarray(0, 32).equals(sha256(rp.id))) throw new Error('rpId');
  const flags = bytes[32];
  if (!(flags & 0x01) || !(flags & 0x04)) throw new Error('user');
  const signCount = bytes.readUInt32BE(33);
  if (!(flags & 0x40)) return { signCount };
  const idLength = bytes.readUInt16BE(53);
  const credentialId = bytes.subarray(55, 55 + idLength);
  if (credentialId.length !== idLength) throw new Error('credentialId');
  const [, end] = decodeCbor(bytes, 55 + idLength);
  return { signCount, credentialId, publicKey: bytes.subarray(55 + idLength, end) };
}

// The node:crypto key of a COSE public key with the algorithm ES256 or RS256.
function keyOf(cose) {
  const [map] = decodeCbor(cose);
  const alg = map.get(3);
  const part = (label) => {
    const value = map.get(label);
    if (!Buffer.isBuffer(value)) throw new Error('key');
    return value.toString('base64url');
  };
  if (alg === ES256 && map.get(1) === 2 && map.get(-1) === 1) {
    return createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: part(-2), y: part(-3) }, format: 'jwk' });
  }
  if (alg === RS256 && map.get(1) === 3) {
    return createPublicKey({ key: { kty: 'RSA', n: part(-1), e: part(-2) }, format: 'jwk' });
  }
  throw new Error('alg');
}

// The challenge of client data JSON of the type, after checking the origin.
function readClientData(bytes, type, rp) {
  const data = JSON.parse(bytes.toString('utf8'));
  if (data.type !== type || !rp.origins.includes(data.origin) || data.crossOrigin === true) throw new Error('client');
  if (typeof data.challenge !== 'string') throw new Error('challenge');
  return data.challenge;
}

// A registration {clientDataJSON, attestationObject} of navigator.credentials.create, as Buffers, gives
// {challenge, credentialId, publicKey, signCount}: the challenge to consume, the base64url credential id, the
// base64url COSE public key and the signature counter.
export function verifyRegistration({ clientDataJSON, attestationObject }, rp) {
  const challenge = readClientData(clientDataJSON, 'webauthn.create', rp);
  const [attestation] = decodeCbor(attestationObject);
  const authData = attestation instanceof Map && attestation.get('authData');
  if (!Buffer.isBuffer(authData)) throw new Error('attestation');
  const { signCount, credentialId, publicKey } = readAuthData(authData, rp);
  if (!publicKey) throw new Error('credential');
  keyOf(publicKey);
  return {
    challenge,
    credentialId: credentialId.toString('base64url'),
    publicKey: publicKey.toString('base64url'),
    signCount,
  };
}

// A sign-in {clientDataJSON, authenticatorData, signature} of navigator.credentials.get, as Buffers, checked
// against the stored base64url COSE public key, gives {challenge, signCount}.
export function verifySignIn({ clientDataJSON, authenticatorData, signature }, publicKey, rp) {
  const challenge = readClientData(clientDataJSON, 'webauthn.get', rp);
  const { signCount } = readAuthData(authenticatorData, rp);
  const key = keyOf(Buffer.from(publicKey, 'base64url'));
  const signed = Buffer.concat([authenticatorData, sha256(clientDataJSON)]);
  if (!verify('sha256', signed, key, signature)) throw new Error('signature');
  return { challenge, signCount };
}
