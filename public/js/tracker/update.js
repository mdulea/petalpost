// The tracker section of a guest-list invitation's latest update. Uses validateUpdateNotice from invite.js, runs writes
// through page.runAction, and renders the WhatsApp queue synchronously from party.links.
import { UI } from '../i18n.js';
import { UPDATE_NOTICE_LIMIT, updateMessage, validateUpdateNotice, whatsappUrl } from '../invite.js';

// The update of the last load. A reload keeps text the host has typed since then.
let saved = '';

const text = () => /** @type {HTMLTextAreaElement} */ (document.getElementById('updateText'));
const setStatus = (message) => {
  document.getElementById('updateStatus').textContent = message;
};

function init({ client, cred, lang, runAction }) {
  const words = UI[lang].partyUpdate;
  const form = /** @type {HTMLFormElement} */ (document.getElementById('updateForm'));
  const save = (updateNotice, done) =>
    runAction({
      controls: form.elements,
      setStatus,
      action: () => client.saveUpdate(cred, updateNotice),
      reload: 'ok',
      afterReload: () => setStatus(done),
    });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const checked = validateUpdateNotice(text().value);
    if (!checked.ok || checked.value === null) {
      setStatus(words.invalid(UPDATE_NOTICE_LIMIT));
      return;
    }
    return save(checked.value, words.saved);
  });
  document.getElementById('removeUpdate').addEventListener('click', () => {
    if (window.confirm(words.removeConfirm)) return save(null, words.removed);
  });
}

function queueItem(party, updateNotice, words) {
  const row = document.createElement('li');
  row.className = 'reply';
  const name = document.createElement('strong');
  name.textContent = party.name;
  const language = document.createElement('span');
  language.textContent = words.language[party.lang];
  const whatsapp = document.createElement('a');
  whatsapp.className = 'btn btn-ghost btn-small';
  whatsapp.href = whatsappUrl(updateMessage(party, updateNotice, party.links.personal));
  whatsapp.target = '_blank';
  whatsapp.rel = 'noopener noreferrer';
  whatsapp.textContent = words.whatsapp;
  whatsapp.setAttribute('aria-label', `${words.whatsapp} · ${party.name}`);
  row.append(name, language, whatsapp);
  return row;
}

function show({ parties, updateNotice = '' }, { lang, signedIn }) {
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
  const items = parties
    .filter((party) => !party.revoked && party.links)
    .map((party) => queueItem(party, updateNotice, words));
  queue.replaceChildren(...items);
}

export const section = { id: 'partyUpdate', modes: ['guestList'], init, show };
