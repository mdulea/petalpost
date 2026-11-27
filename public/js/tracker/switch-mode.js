// The tracker section that switches a published open invitation to the guest-list mode. Only the management link
// can switch, so a passkey sign-in sees no button.
import { UI } from '../i18n.js';

function init({ lang, client, cred, signedIn, runAction }) {
  const button = /** @type {HTMLButtonElement} */ (document.getElementById('switchToGuestList'));
  button.hidden = signedIn;
  const status = document.getElementById('switchModeStatus');
  const words = UI[lang].guestList;
  button.addEventListener('click', () => {
    if (!window.confirm(words.switchConfirm)) return;
    return runAction({
      controls: [button],
      setStatus: (text) => {
        status.textContent = text;
      },
      action: () => client.switchMode(cred, 'guestList'),
      reload: 'ok',
    });
  });
}

export const section = { id: 'switchMode', modes: ['open'], init };
