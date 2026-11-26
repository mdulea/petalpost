// The tracker section that saves a passkey for the invitation, named after its heading. An access token cannot save
// passkeys, so the section stays hidden after a passkey sign-in and in a browser without WebAuthn.
import { MODES } from '../invite.js';
import { passkeysSupported, savePasskey } from '../passkey.js';

// The heading of the last load, which names a saved passkey.
let heading = '';

function init({ lang, client, cred }) {
  document.getElementById('savePasskey').addEventListener('click', async (e) => {
    const button = /** @type {HTMLButtonElement} */ (e.currentTarget);
    button.disabled = true;
    const result = await savePasskey(client, navigator.credentials, cred, heading, lang);
    button.disabled = false;
    document.getElementById('passkeyStatus').textContent = result.message;
  });
}

function show({ invite }, { copy, signedIn }) {
  heading = invite.title || copy.defaultHeading;
  document.getElementById('passkeyPanel').hidden = signedIn || !passkeysSupported(globalThis);
}

export const section = { id: 'passkeyPanel', modes: MODES, init, show };
