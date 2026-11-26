// Passkeys of the management page and the home page. savePasskey and findInvitation run one WebAuthn ceremony with
// credentials, which has the navigator.credentials shape, and the API client of public/js/rsvp.js. It has no DOM
// access, so tests/check-dom-free.js loads it in Node.
// Both resolve {ok, message, data}: message is text to show the user, also after success, and data is the sign-in
// {eventId, token, expiresAt} for findInvitation. A passkey is a discoverable credential with user verification,
// so the browser asks for Face ID, a fingerprint, Windows Hello or the device PIN, and a sign-in needs no invitation.
import { UI, normalizeLang } from './i18n.js';
import { toBase64url } from './rsvp.js';

const fromBase64url = (text) =>
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

// The ES256 and RS256 algorithms that server/webauthn.js verifies.
const ALGORITHMS = [-7, -257];
const TIMEOUT = 120000;

// Whether the browser offers WebAuthn; scope is globalThis in the browser.
export const passkeysSupported = (scope) => typeof scope.PublicKeyCredential === 'function';

// The message of a WebAuthn error: the user cancelled or timed out, or the browser refused.
function ceremonyFailure(error, copy) {
  return { ok: false, data: null, message: error?.name === 'NotAllowedError' ? copy.cancelled : copy.failed };
}

// Saves a passkey for the event of cred, which holds the management secret. The passkey is named after the
// invitation's title, which the browser shows when it asks which passkey to use.
export async function savePasskey(client, credentials, cred, title, lang) {
  const copy = UI[normalizeLang(lang)].passkey;
  const challenge = await client.passkeyChallenge(cred);
  if (!challenge.ok) return challenge;
  let credential;
  try {
    credential = await credentials.create({
      publicKey: {
        challenge: fromBase64url(challenge.data.challenge),
        rp: { name: 'Petalpost' },
        user: { id: fromBase64url(cred.id), name: title, displayName: title },
        pubKeyCredParams: ALGORITHMS.map((alg) => ({ type: 'public-key', alg })),
        authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
        attestation: 'none',
        timeout: TIMEOUT,
      },
    });
  } catch (error) {
    return ceremonyFailure(error, copy);
  }
  const saved = await client.savePasskey(cred, {
    clientDataJSON: toBase64url(credential.response.clientDataJSON),
    attestationObject: toBase64url(credential.response.attestationObject),
  });
  return saved.ok ? { ...saved, message: copy.saved } : saved;
}

// Signs in with a passkey that the browser offers, and gives the invitation id and access token.
export async function findInvitation(client, credentials, lang) {
  const copy = UI[normalizeLang(lang)].passkey;
  const challenge = await client.signInChallenge();
  if (!challenge.ok) return challenge;
  let credential;
  try {
    credential = await credentials.get({
      publicKey: {
        challenge: fromBase64url(challenge.data.challenge),
        userVerification: 'required',
        timeout: TIMEOUT,
      },
    });
  } catch (error) {
    return ceremonyFailure(error, copy);
  }
  const { response } = credential;
  const result = await client.signIn({
    id: credential.id,
    clientDataJSON: toBase64url(response.clientDataJSON),
    authenticatorData: toBase64url(response.authenticatorData),
    signature: toBase64url(response.signature),
  });
  return result.ok ? { ...result, message: copy.opening } : result;
}
