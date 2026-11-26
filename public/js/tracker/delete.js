// The tracker section that deletes the invitation with every reply after the host confirms, and marks it as ended
// under "My invitations" in this browser.
import { MODES, endInvitation } from '../invite.js';

function init({ copy, client, cred, storage, setStatus, showOnly }) {
  document.getElementById('deleteEvent').addEventListener('click', async (e) => {
    if (!window.confirm(copy.deleteConfirm)) return;
    const button = /** @type {HTMLButtonElement} */ (e.currentTarget);
    button.disabled = true;
    const result = await client.deleteEvent(cred);
    button.disabled = false;
    if (result.ok) {
      endInvitation(storage, cred.id);
      showOnly(copy.deletedHeading, copy.deletedMessage);
    } else setStatus(result.message);
  });
}

export const section = { id: 'deleteInvitation', modes: MODES, init };
