// The tracker section of a guest-list invitation's latest update. The host saves or removes one update, which the
// personal links and view links show. With the management link, the queue lists one WhatsApp message per party with a
// working personal link, in the party's language. A passkey sign-in can save the update but cannot build the links.
import { UI } from '../i18n.js';
import { partyInviteLinks, UPDATE_NOTICE_LIMIT, updateMessage, whatsappUrl } from '../invite.js';

// Counts renders, so a slower earlier render does not replace the queue of a later load.
let renders = 0;
// The update of the last load. A reload keeps text the host has typed since then.
let saved = '';

const text = () => /** @type {HTMLTextAreaElement} */ (document.getElementById('updateText'));

function setStatus(message) {
  document.getElementById('updateStatus').textContent = message;
}

function init({ client, cred, lang, load }) {
  const words = UI[lang].partyUpdate;
  const form = /** @type {HTMLFormElement} */ (document.getElementById('updateForm'));
  text().maxLength = UPDATE_NOTICE_LIMIT;
  const save = async (updateNotice, done) => {
    for (const control of form.elements) control.setAttribute('disabled', '');
    setStatus('');
    const result = await client.saveUpdate(cred, updateNotice);
    for (const control of form.elements) control.removeAttribute('disabled');
    if (!result.ok) {
      setStatus(result.message);
      return;
    }
    await load();
    setStatus(done);
  };
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = text().value.trim();
    if (!value || value.length > UPDATE_NOTICE_LIMIT) {
      setStatus(words.invalid(UPDATE_NOTICE_LIMIT));
      return;
    }
    return save(value, words.saved);
  });
  document.getElementById('removeUpdate').addEventListener('click', () => {
    if (window.confirm(words.removeConfirm)) return save(null, words.removed);
  });
}

async function queueItem(party, updateNotice, cred, words) {
  const { personal: link } = await partyInviteLinks(location.origin, cred, party);
  const row = document.createElement('li');
  row.className = 'reply';
  const name = document.createElement('strong');
  name.textContent = party.name;
  const language = document.createElement('span');
  language.textContent = words.language[party.lang];
  const whatsapp = document.createElement('a');
  whatsapp.className = 'btn btn-ghost btn-small';
  whatsapp.href = whatsappUrl(updateMessage(party, updateNotice, link));
  whatsapp.target = '_blank';
  whatsapp.rel = 'noopener noreferrer';
  whatsapp.textContent = words.whatsapp;
  whatsapp.setAttribute('aria-label', `${words.whatsapp} · ${party.name}`);
  row.append(name, language, whatsapp);
  return row;
}

async function show({ parties, updateNotice = '' }, { cred, lang, signedIn }) {
  const render = ++renders;
  if (text().value === saved) text().value = updateNotice;
  saved = updateNotice;
  document.getElementById('removeUpdate').hidden = !updateNotice;
  document.getElementById('updateQueueLinkRequired').hidden = !(signedIn && updateNotice);
  const queue = document.getElementById('updateQueue');
  if (!updateNotice || signedIn) {
    queue.replaceChildren();
    return;
  }
  const words = UI[lang].guestList;
  const linked = parties.filter((party) => !party.revoked);
  const items = await Promise.all(linked.map((party) => queueItem(party, updateNotice, cred, words)));
  if (render === renders) queue.replaceChildren(...items);
}

export const section = { id: 'partyUpdate', modes: ['guestList'], init, show };
