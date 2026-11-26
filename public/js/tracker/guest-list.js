// Edits the guest list and renders its parties, replies, totals and personal links.
import { guestListCsv, guestListCsvName } from '../csv.js';
import { UI } from '../i18n.js';
import { eventLink } from '../invite.js';
import { parsePartyNames, validPartyName } from '../party-names.js';
import { newId, PARTY_LIMITS, partyLinkSecret, personalLink } from '../rsvp.js';
import { downloadCsv } from './download.js';

let loadedParties = [];
let rows = [];
let writing = false;

function setStatus(message) {
  document.getElementById('partyStatus').textContent = message;
}

// Serializes tracker writes in this tab and refreshes the list before the next write.
async function change(load, controls, write) {
  if (writing) return;
  writing = true;
  for (const control of controls) control.setAttribute('disabled', '');
  setStatus('');
  try {
    const result = await write();
    if (result.message) setStatus(result.message);
    await load();
  } finally {
    for (const control of controls) control.removeAttribute('disabled');
    writing = false;
  }
}

function filterRows() {
  const search = /** @type {HTMLInputElement} */ (document.getElementById('partySearch'));
  const filter = /** @type {HTMLSelectElement} */ (document.getElementById('partyFilter'));
  const query = search.value.trim().toLocaleLowerCase().normalize();
  let matches = 0;
  for (const { party, row } of rows) {
    const status = party.reply ? 'replied' : 'pending';
    row.hidden =
      !party.name.toLocaleLowerCase().normalize().includes(query) ||
      (filter.value !== 'all' && status !== filter.value);
    if (!row.hidden) matches++;
  }
  document.getElementById('noParties').hidden = rows.length > 0;
  document.getElementById('noMatchingParties').hidden = rows.length === 0 || matches > 0;
}

function init({ client, cred, lang, load, signedIn }) {
  const form = /** @type {HTMLFormElement} */ (document.getElementById('addParty'));
  document.getElementById('refreshParties').addEventListener('click', load);
  document.getElementById('partySearch').addEventListener('input', filterRows);
  document.getElementById('partyFilter').addEventListener('change', filterRows);
  document.getElementById('downloadGuestList').addEventListener('click', () => {
    downloadCsv(guestListCsv(loadedParties, lang), guestListCsvName(lang, new Date()));
  });
  form.hidden = signedIn;
  document.getElementById('partyManagementLinkRequired').hidden = !signedIn;
  if (signedIn) return;

  const words = UI[lang].guestList;
  const namesInput = /** @type {HTMLTextAreaElement} */ (document.getElementById('partyName'));
  const seats = /** @type {HTMLInputElement} */ (document.getElementById('defaultSeats'));
  seats.max = String(PARTY_LIMITS.seats);
  // Hold the remaining request unchanged until an ambiguous result can be retried.
  let retry;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (writing) return;
    let addition = retry;
    if (!addition) {
      const names = parsePartyNames(namesInput.value);
      if (!names.length || !names.every(validPartyName)) {
        setStatus(words.invalidName(PARTY_LIMITS.name));
        return;
      }
      if (loadedParties.length + names.length > PARTY_LIMITS.count) {
        setStatus(words.limit(PARTY_LIMITS.count));
        return;
      }
      addition = { entries: names.map((name) => ({ name, id: newId() })), defaultSeats: seats.valueAsNumber };
    }
    await change(load, form.elements, async () => {
      const { entries, defaultSeats } = addition;
      const result = await client.addParties(cred, entries, defaultSeats);
      const remaining = entries.slice(result.added);
      retry = !result.ok && (result.status === 0 || result.status >= 500) ? { entries: remaining, defaultSeats } : null;
      namesInput.readOnly = seats.readOnly = Boolean(retry);
      if (result.ok) {
        form.reset();
        return result;
      }
      namesInput.value = remaining.map(({ name }) => name).join('\n');
      const message = [result.message, result.added ? words.partial : '', retry ? words.retryPaste : '']
        .filter(Boolean)
        .join(' ');
      return { ...result, message };
    });
  });
}

function renderTotals(parties, words) {
  let accepted = 0;
  let declined = 0;
  let pending = 0;
  for (const { reply } of parties) {
    if (!reply) pending++;
    else if (reply.attending) accepted += reply.partySize;
    else declined++;
  }
  const totals = [
    [accepted, words.acceptedSeats(accepted)],
    [declined, words.declinedParties(declined)],
    [pending, words.pendingParties(pending)],
  ];
  document.getElementById('partyTotals').replaceChildren(
    ...totals.map(([count, label]) => {
      const item = document.createElement('li');
      item.className = 'total';
      const number = document.createElement('strong');
      number.textContent = String(count);
      const text = document.createElement('span');
      text.textContent = String(label);
      item.append(number, ' ', text);
      return item;
    }),
  );
}

function button(label, click) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'btn btn-ghost btn-small';
  element.textContent = label;
  element.addEventListener('click', () => click(element));
  return element;
}

async function renderParty(party, { client, cred, copy, load, signedIn }, words) {
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
  if (party.revoked) {
    const revoked = document.createElement('span');
    revoked.textContent = words.revoked;
    row.append(revoked);
  }
  const actions = document.createElement('div');
  actions.className = 'reply-actions';
  if (!signedIn) {
    const linkControls = [];
    const linkAction = (action, { label, confirm, done }) => {
      const element = button(label, () => {
        if (writing || !window.confirm(confirm)) return;
        return change(load, linkControls, async () => {
          const result = await client.changePartyLink(cred, party.id, action, party.linkGeneration);
          return result.ok ? { ...result, message: done } : result;
        });
      });
      linkControls.push(element);
      actions.append(element);
    };
    if (!party.revoked) {
      row.append(await personalLinkControls(party, cred, copy, words, linkControls));
      linkAction('revoke', { label: words.revoke, confirm: words.revokeConfirm, done: words.revoked });
    }
    linkAction('regenerate', { label: words.regenerate, confirm: words.regenerateConfirm, done: words.regenerated });
  }
  actions.append(
    button(words.rename, (element) => {
      if (writing) return;
      const value = window.prompt(words.renamePrompt, party.name)?.trim();
      if (value === undefined || value === party.name) return;
      if (!validPartyName(value)) {
        setStatus(words.renameInvalid(PARTY_LIMITS.name));
        return;
      }
      return change(load, [element], () => client.renameParty(cred, party.id, value));
    }),
    button(words.delete, (element) => {
      if (!writing && window.confirm(words.confirmDelete(party.name))) {
        return change(load, [element], () => client.deleteParty(cred, party.id));
      }
    }),
  );
  row.append(actions);
  return { party, row };
}

async function personalLinkControls(party, cred, copy, words, linkControls) {
  const secret = await partyLinkSecret(cred.secret, party.id, 'personal', party.linkGeneration);
  const link = personalLink(eventLink(location.origin, cred.id, party.lang), party.id, secret);
  const copyLink = button(words.copy, async () => {
    try {
      await navigator.clipboard.writeText(link);
      setStatus(words.copied);
    } catch {
      window.prompt(copy.copyPrompt, link);
    }
  });
  const input = document.createElement('input');
  input.className = 'input';
  input.readOnly = true;
  input.value = link;
  linkControls.push(input, copyLink);
  input.setAttribute('aria-label', `${words.link} · ${party.name}`);
  const controls = document.createElement('div');
  controls.className = 'copy-row';
  controls.append(input, copyLink);
  return controls;
}

async function show({ parties }, page) {
  loadedParties = parties;
  const words = UI[page.lang].guestList;
  const rendered = await Promise.all(parties.map((party) => renderParty(party, page, words)));
  if (loadedParties !== parties) return;
  rows = rendered;
  renderTotals(parties, words);
  document.getElementById('partyList').replaceChildren(...rows.map(({ row }) => row));
  filterRows();
}

export const section = { id: 'guestList', modes: ['guestList'], init, show };
