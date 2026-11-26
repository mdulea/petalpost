// Adds parties and shows their seats, replies and copyable personal links in the tracker.
import { UI } from '../i18n.js';
import { eventLink } from '../invite.js';
import { newId, PARTY_LIMITS, partyLinkSecret, personalLink } from '../rsvp.js';

function init({ client, cred, load, signedIn }) {
  const form = /** @type {HTMLFormElement} */ (document.getElementById('addParty'));
  document.getElementById('refreshParties').addEventListener('click', load);
  form.hidden = signedIn;
  document.getElementById('partyManagementLinkRequired').hidden = !signedIn;
  if (signedIn) return;
  const seats = /** @type {HTMLInputElement} */ (document.getElementById('defaultSeats'));
  const submit = form.querySelector('button[type="submit"]');
  const status = document.getElementById('partyStatus');
  seats.max = String(PARTY_LIMITS.seats);
  let pendingId = newId();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.hasAttribute('disabled')) return;
    const name = new FormData(form).get('name');
    const defaultSeats = seats.valueAsNumber;
    for (const control of form.elements) control.setAttribute('disabled', '');
    status.textContent = '';
    const result = await client.addParty(cred, pendingId, { name, defaultSeats });
    for (const control of form.elements) control.removeAttribute('disabled');
    if (!result.ok) {
      status.textContent = result.message;
      return;
    }
    pendingId = newId();
    form.reset();
    load();
  });
}

async function show({ parties }, { cred, lang, copy, signedIn }) {
  const words = UI[lang].guestList;
  const rows = await Promise.all(
    parties.map(async (party) => {
      const row = document.createElement('li');
      row.className = 'reply';
      const name = document.createElement('strong');
      name.textContent = party.name;
      const seats = document.createElement('span');
      seats.textContent = words.defaultSeats(party.defaultSeats);
      const reply = document.createElement('span');
      reply.textContent = party.reply ? words.answer(party.reply.attending, party.reply.partySize) : words.noReply;
      row.append(name, seats, reply);
      if (party.reply?.note) {
        const note = document.createElement('p');
        note.textContent = party.reply.note;
        row.append(note);
      }
      if (signedIn) return row;
      const secret = await partyLinkSecret(cred.secret, party.id, 'personal');
      const link = personalLink(eventLink(location.origin, cred.id, party.lang), party.id, secret);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'btn btn-ghost btn-small';
      button.textContent = words.copy;
      button.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(link);
          document.getElementById('partyStatus').textContent = words.copied;
        } catch {
          window.prompt(copy.copyPrompt, link);
        }
      });
      const input = document.createElement('input');
      input.className = 'input';
      input.readOnly = true;
      input.value = link;
      input.setAttribute('aria-label', `${words.link} · ${party.name}`);
      const controls = document.createElement('div');
      controls.className = 'copy-row';
      controls.append(input, button);
      row.append(controls);
      return row;
    }),
  );
  document.getElementById('noParties').hidden = rows.length > 0;
  document.getElementById('partyList').replaceChildren(...rows);
}

export const section = { id: 'guestList', modes: ['guestList'], init, show };
