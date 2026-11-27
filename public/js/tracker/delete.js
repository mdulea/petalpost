// The tracker section that deletes the invitation with every reply after the host confirms, and marks it as ended
// under "My invitations" in this browser.
import { MODES, endInvitation } from '../invite.js';

function init({ copy, client, cred, storage, setStatus, showOnly, runAction }) {
  document.getElementById('deleteEvent').addEventListener('click', (e) => {
    if (!window.confirm(copy.deleteConfirm)) return;
    const button = /** @type {HTMLButtonElement} */ (e.currentTarget);
    return runAction({
      controls: [button],
      setStatus,
      action: () => client.deleteEvent(cred),
      reload: 'none',
      onResult: (result) => {
        if (result.ok) {
          endInvitation(storage, cred.id);
          showOnly(copy.deletedHeading, copy.deletedMessage);
        }
      },
    });
  });
}

export const section = { id: 'deleteInvitation', modes: MODES, init };
