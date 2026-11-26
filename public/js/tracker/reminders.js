// Lists parties without a reply and marks the WhatsApp links opened in this tab's session.
import { UI } from '../i18n.js';
import { partyInviteLinks, reminderMessage, whatsappUrl } from '../invite.js';
import { renderTotals } from './totals.js';

// Keys of reminders opened in this tab. Memory keeps them through tracker refreshes if storage is blocked.
const opened = new Set();
// Counts show calls, so a slower earlier render never replaces the rows of a later one.
let latestShow = 0;

// Records that the host opened the reminder keyed by invitation and party. Stores only a marker.
function markReminderOpened(key) {
  opened.add(key);
  try {
    sessionStorage.setItem(key, '1');
  } catch {
    // Storage is blocked, so only memory keeps the marker.
  }
}

// True when the host opened the reminder keyed by invitation and party in this tab session.
function isReminderOpened(key) {
  try {
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
    if (isReminderOpened(key)) status.textContent = words.reminderUsed;
    link.addEventListener('click', () => {
      markReminderOpened(key);
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
