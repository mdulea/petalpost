// Lists parties without a reply and marks the WhatsApp links opened in this tab's session.
import { UI } from '../i18n.js';
import { partyInviteLinks, reminderMessage, whatsappUrl } from '../invite.js';
import { renderTotals } from './totals.js';

const opened = new Set();
let latestShow = 0;

// Stores only a marker keyed by invitation and party. Memory keeps it through tracker refreshes if storage is blocked.
function reminderOpened(key, mark = false) {
  if (mark) opened.add(key);
  try {
    if (mark) sessionStorage.setItem(key, '1');
    return opened.has(key) || sessionStorage.getItem(key) === '1';
  } catch {
    return opened.has(key);
  }
}

async function renderParty(party, { cred, signedIn }, words) {
  const row = document.createElement('li');
  row.className = 'reply';
  const name = document.createElement('strong');
  name.textContent = party.name;
  row.append(name);
  if (party.revoked) {
    const status = document.createElement('span');
    status.textContent = words.revoked;
    row.append(status);
  } else if (!signedIn) {
    const { personal } = await partyInviteLinks(location.origin, cred, party);
    const link = document.createElement('a');
    link.className = 'btn btn-ghost btn-small';
    link.href = whatsappUrl(reminderMessage(party, personal));
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = words.remind;
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    const key = `petalpost:reminder:${cred.id}:${party.id}`;
    if (reminderOpened(key)) status.textContent = words.reminderUsed;
    link.addEventListener('click', () => {
      reminderOpened(key, true);
      status.textContent = words.reminderUsed;
    });
    const actions = document.createElement('div');
    actions.className = 'reply-actions';
    actions.append(link, status);
    row.append(actions);
  }
  return row;
}

async function show({ parties }, page) {
  const request = ++latestShow;
  const pending = parties.filter((party) => !party.reply);
  const words = UI[page.lang].guestList;
  const rows = await Promise.all(pending.map((party) => renderParty(party, page, words)));
  if (request !== latestShow) return;
  document.getElementById('reminderManagementLinkRequired').hidden = !page.signedIn || pending.length === 0;
  renderTotals(document.getElementById('reminderCount'), [[pending.length, words.pendingParties(pending.length)]]);
  document.getElementById('reminderList').replaceChildren(...rows);
}

export const section = { id: 'reminders', modes: ['guestList'], show };
