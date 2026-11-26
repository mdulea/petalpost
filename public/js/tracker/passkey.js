// Lists the invitation's passkeys. Saving and removing them require the full management link.
import { UI, localeOf } from '../i18n.js';
import { MODES } from '../invite.js';
import { passkeysSupported, savePasskey } from '../passkey.js';

// The heading of the last load names a saved passkey. Only the latest list request may update the rows.
let heading = '';
let latestList = 0;

const status = () => document.getElementById('passkeyStatus');

// A dated passkey row with a removal control when the host opened the full management link.
function passkeyRow(page, { id, createdAt }, index, format) {
  const copy = UI[page.lang].passkey;
  const row = document.createElement('li');
  row.className = 'reply';
  const time = document.createElement('time');
  time.dateTime = createdAt;
  time.textContent = copy.savedOn(format.format(new Date(createdAt)));
  row.append(time);
  if (page.signedIn) return row;
  const actions = document.createElement('div');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'btn btn-ghost btn-small';
  button.textContent = copy.remove;
  button.setAttribute('aria-label', copy.removeLabel(index + 1));
  button.addEventListener('click', async () => {
    if (!window.confirm(copy.removeConfirm)) return;
    button.disabled = true;
    const result = await page.client.removePasskey(page.cred, id);
    if (result.ok) {
      status().textContent = copy.removed;
      row.remove();
      await refreshList(page);
    } else {
      button.disabled = false;
      status().textContent = result.message;
    }
  });
  actions.append(button);
  row.append(actions);
  return row;
}

// Reloads the rows after a page refresh, save or removal.
async function refreshList(page) {
  const request = ++latestList;
  const result = await page.client.listPasskeys(page.cred);
  if (request !== latestList) return;
  if (!result.ok) {
    status().textContent = result.message;
    return;
  }
  const list = document.getElementById('passkeyList');
  const format = new Intl.DateTimeFormat(localeOf(page.lang), { dateStyle: 'medium', timeStyle: 'medium' });
  list.replaceChildren(...result.data.passkeys.map((passkey, index) => passkeyRow(page, passkey, index, format)));
  list.hidden = !list.childElementCount;
}

function init(page) {
  const { lang, client, cred } = page;
  if (!cred || page.signedIn) return;
  document.getElementById('savePasskey').addEventListener('click', async (e) => {
    const button = /** @type {HTMLButtonElement} */ (e.currentTarget);
    button.disabled = true;
    const result = await savePasskey(client, navigator.credentials, cred, heading, lang);
    status().textContent = result.message;
    if (result.ok) await refreshList(page);
    button.disabled = false;
  });
}

function show({ invite }, page) {
  heading = invite.title || page.copy.defaultHeading;
  const canSave = !page.signedIn && passkeysSupported(globalThis);
  document.getElementById('passkeyHelp').hidden = !canSave;
  document.getElementById('savePasskey').hidden = !canSave;
  refreshList(page);
}

export const section = { id: 'passkeyPanel', modes: MODES, init, show };
