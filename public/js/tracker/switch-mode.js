// The tracker section that switches a published open invitation to the guest-list mode. Only the management link
// can switch, so a passkey sign-in sees no button.
import { UI } from '../i18n.js';

function init({ lang, client, cred, load, signedIn }) {
  const button = /** @type {HTMLButtonElement} */ (document.getElementById('switchToGuestList'));
  button.hidden = signedIn;
  const status = document.getElementById('switchModeStatus');
  const words = UI[lang].guestList;
  button.addEventListener('click', async () => {
    if (!window.confirm(words.switchConfirm)) return;
    button.disabled = true;
    status.textContent = '';
    const result = await client.switchMode(cred, 'guestList');
    button.disabled = false;
    if (result.ok) await load();
    else status.textContent = result.message;
  });
}

export const section = { id: 'switchMode', modes: ['open'], init };
