// A personal-link reply stays on the same page for save, edit and withdrawal. Only the server's confirmed version
// goes in a subsequent mutation. Conflict responses replace the form values with the current reply.
import { PARTY_LIMITS } from '../rsvp.js';

export function renderReply(party, { client, eventId, credential, copy, guestCopy, unavailable }) {
  const form = document.createElement('form');
  form.className = 'panel rsvp';
  form.id = 'personalReply';
  form.autocomplete = 'off';
  form.noValidate = true;
  // Only static UI strings enter the markup. Party data is assigned as DOM properties below.
  form.innerHTML = `
    <h2>${copy.heading}</h2>
    <fieldset class="field">
      <div class="field" role="radiogroup" aria-labelledby="personalAttending">
        <span class="field-label" id="personalAttending">${copy.attending}</span>
        <div class="choices">
          <label class="choice"><input type="radio" name="attending" value="yes" checked />${copy.yes}</label>
          <label class="choice"><input type="radio" name="attending" value="no" />${copy.no}</label>
        </div>
      </div>
      <div class="field">
        <label for="personalSeats">${copy.seats}</label>
        <input class="input" type="number" name="partySize" id="personalSeats" min="1" required />
      </div>
      <div class="field">
        <label for="personalNote">${copy.note}</label>
        <textarea class="input" name="note" id="personalNote" aria-describedby="personalNoteHint"></textarea>
        <span class="hint" id="personalNoteHint">${copy.noteHint}</span>
      </div>
      <div class="reply-actions">
        <button class="btn btn-primary" type="submit">${copy.send}</button>
        <button class="btn btn-rose btn-small" type="button" hidden>${copy.withdraw}</button>
      </div>
    </fieldset>
    <p class="status" role="status"></p>`;

  const fields = form.querySelector('fieldset');
  const yes = /** @type {HTMLInputElement} */ (form.querySelector('[value="yes"]'));
  const no = /** @type {HTMLInputElement} */ (form.querySelector('[value="no"]'));
  const seats = /** @type {HTMLInputElement} */ (form.querySelector('#personalSeats'));
  const note = form.querySelector('textarea');
  const submit = /** @type {HTMLButtonElement} */ (form.querySelector('button[type="submit"]'));
  const withdraw = /** @type {HTMLButtonElement} */ (form.querySelector('button[type="button"]'));
  const status = form.querySelector('[role="status"]');
  seats.max = String(PARTY_LIMITS.seats);
  const cred = { ...credential, version: undefined };
  let closed = Boolean(party.deadlineClosed);

  function lockClosed(message) {
    closed = true;
    fields.disabled = true;
    submit.hidden = true;
    withdraw.hidden = true;
    if (message) {
      status.textContent = message;
      const deadlineBanner = document.querySelector('#personalDeadline p');
      if (deadlineBanner) deadlineBanner.textContent = message;
    }
  }

  function fill(reply) {
    cred.version = reply?.version;
    yes.checked = reply?.attending ?? true;
    no.checked = !yes.checked;
    seats.value = String(reply?.attending ? reply.partySize : party.defaultSeats);
    seats.disabled = !yes.checked;
    note.value = reply?.note ?? '';
    withdraw.hidden = closed || !reply;
  }

  function finish(result, success) {
    if (result.status === 409) fill(result.data.reply);
    if (result.status === 404) {
      unavailable(result.message);
      return;
    }
    if (result.status === 403) {
      lockClosed(result.message);
      return;
    }
    fields.disabled = false;
    status.textContent = result.ok ? success : result.message;
  }

  form.addEventListener('change', () => {
    seats.disabled = !yes.checked;
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (fields.disabled) return;
    fields.disabled = true;
    status.textContent = guestCopy.sendingReply;
    const first = cred.version === undefined;
    const result = await client.savePartyReply(eventId, cred, {
      attending: yes.checked,
      partySize: yes.checked ? seats.valueAsNumber : 0,
      note: note.value.replaceAll('\t', ' '),
    });
    if (result.ok) {
      cred.version = result.data.version;
      withdraw.hidden = false;
    }
    finish(result, first ? guestCopy.replySent : guestCopy.replyUpdated);
  });
  withdraw.addEventListener('click', async () => {
    if (fields.disabled || !window.confirm(guestCopy.withdrawConfirm)) return;
    fields.disabled = true;
    status.textContent = guestCopy.withdrawingReply;
    const result = await client.withdrawPartyReply(eventId, cred);
    if (result.ok) fill(null);
    finish(result, copy.withdrawn);
  });
  fill(party.reply);
  if (closed) lockClosed();
  if (!party.reply) status.textContent = copy.noReply;
  return form;
}
