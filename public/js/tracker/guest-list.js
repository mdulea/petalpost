// Edits the guest list and renders its parties, replies, earlier unattached replies, totals and personal links. With
// sub-events, each reply also lists its answer to each sub-event, the totals add a line for each sub-event, the CSV
// adds the answers, and the host edits the seats of each sub-event through the reply form in place of the seat editor.
// With menu options, each reply lists its meal counts, the totals add the meals of each option, the CSV adds the
// counts, and the seat editor and the reply form take the meal counts with the seats.
// The host picks the sub-events of each party in its row, or of every party the search and filter show at once. A
// party's row, reply form and answer lines show only its sub-events.
import { guestListCsv, guestListCsvName } from '../csv.js';
import { UI } from '../i18n.js';
import { menuLabels, partyInviteLinks, personalMessage, subEventLabels, whatsappUrl } from '../invite.js';
import {
  normalizePartySearch,
  parsePartyNames,
  partyMatches,
  partySubEventTally,
  partyTotals,
  validPartyName,
} from '../guest-list.js';
import { mealFields, mealLine, mealTotals } from '../meal-choices.js';
import { newId, PARTY_LIMITS, partyStatus } from '../rsvp.js';
import { answerFields, answerList, answerTotals } from '../sub-event-answers.js';
import { downloadCsv } from './download.js';
import { partyHandle, tablePicker } from './seating.js';
import { renderTotals } from './totals.js';

let loadedParties = [];
let loadedLabels = [];
let loadedMenu = [];
let rows = [];
let writing = false;

function setStatus(message) {
  document.getElementById('partyStatus').textContent = message;
}

// Serializes tracker writes in this tab and refreshes the list before the next write.
async function writeAndReload(load, controls, write) {
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
  const query = normalizePartySearch(search.value);
  let matches = 0;
  for (const { party, row } of rows) {
    row.hidden = !partyMatches(party, query, filter.value);
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
    downloadCsv(guestListCsv(loadedParties, lang, loadedLabels, loadedMenu), guestListCsvName(lang, new Date()));
  });
  form.hidden = signedIn;
  document.getElementById('partyManagementLinkRequired').hidden = !signedIn;
  if (signedIn) return;

  const words = UI[lang].guestList;
  const namesInput = /** @type {HTMLTextAreaElement} */ (document.getElementById('partyName'));
  const seats = /** @type {HTMLInputElement} */ (document.getElementById('defaultSeats'));
  const language = /** @type {HTMLSelectElement} */ (document.getElementById('partyLang'));
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
      addition = {
        entries: names.map((name) => ({ name, id: newId() })),
        defaultSeats: seats.valueAsNumber,
        lang: language.value,
      };
    }
    await writeAndReload(load, form.elements, async () => {
      const { entries, defaultSeats, lang } = addition;
      const result = await client.addParties(cred, entries, defaultSeats, lang);
      const remaining = entries.slice(result.added);
      retry =
        !result.ok && (result.status === 0 || result.status >= 500) ? { entries: remaining, defaultSeats, lang } : null;
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
    language.disabled = Boolean(retry);
  });
}

function button(label, click) {
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'btn btn-ghost btn-small';
  element.textContent = label;
  element.addEventListener('click', () => click(element));
  return element;
}

// A form with one checkbox for each sub-event of labels, checked for the ids in checked, and a submit button. On
// submit, save gets the checked ids, and a form without a checked box shows chooseOne without saving.
function subEventChoice(labels, checked, { legend, submit, load, lang }, save) {
  const copy = UI[lang].subEventReplies;
  const form = document.createElement('form');
  form.noValidate = true;
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'sub-event-answer';
  const title = document.createElement('legend');
  title.className = 'field-label';
  title.textContent = legend;
  const choices = document.createElement('div');
  choices.className = 'choices';
  const boxes = labels.map(({ id, name }) => {
    const label = document.createElement('label');
    label.className = 'choice';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.value = id;
    box.checked = checked.includes(id);
    label.append(box, name);
    choices.append(label);
    return box;
  });
  const button = document.createElement('button');
  button.type = 'submit';
  button.className = 'btn btn-ghost btn-small';
  button.textContent = submit;
  fieldset.append(title, choices, button);
  form.append(fieldset);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const ids = boxes.filter((box) => box.checked).map((box) => box.value);
    if (!ids.length) return setStatus(copy.chooseOne);
    return writeAndReload(load, form.elements, () => save(ids));
  });
  return form;
}

// With menu options, the meal counts come before the seats, and they are disabled while the seats are 0.
function seatEditor(party, { client, cred, load, lang }, menu, words) {
  const form = document.createElement('form');
  form.noValidate = true;
  const row = document.createElement('div');
  row.className = 'copy-row';
  const input = document.createElement('input');
  input.className = 'input';
  input.type = 'number';
  input.name = 'partySize';
  input.min = '0';
  input.max = String(PARTY_LIMITS.seats);
  input.value = String(party.reply?.partySize ?? party.defaultSeats);
  input.setAttribute('aria-label', `${words.seatsLabel} · ${party.name}`);
  const save = document.createElement('button');
  save.type = 'submit';
  save.className = 'btn btn-ghost btn-small';
  save.textContent = words.saveSeats;
  row.append(input, save);
  const meals = menu.length
    ? mealFields(menu, { prefix: `seatMeals-${party.id}`, limit: PARTY_LIMITS.seats, lang })
    : null;
  const sync = () => {
    if (meals) meals.element.disabled = !(input.valueAsNumber > 0);
  };
  if (meals) {
    meals.fill(party.reply);
    form.append(meals.element);
    input.addEventListener('input', sync);
    sync();
  }
  form.append(row);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await writeAndReload(load, form.elements, async () => {
        const result = await client.setPartySeats(cred, party.id, {
          partySize: input.valueAsNumber,
          meals: meals?.read(),
          version: party.reply?.version,
        });
        return result.ok ? { ...result, message: words.seatsSaved } : result;
      });
    } finally {
      sync();
    }
  });
  return form;
}

function buildHostReplyForm(party, { client, cred, load, lang }, labels, menu, words) {
  const form = document.createElement('form');
  form.hidden = true;
  form.autocomplete = 'off';
  const yesId = `hostYes-${party.id}`;
  const noId = `hostNo-${party.id}`;
  const seatsId = `hostSeats-${party.id}`;
  const noteId = `hostNote-${party.id}`;
  form.innerHTML = `
    <div class="field" role="radiogroup">
      <span class="field-label">${words.attending}</span>
      <div class="choices">
        <label class="choice" for="${yesId}"><input type="radio" id="${yesId}" name="attending" value="yes" />${words.yes}</label>
        <label class="choice" for="${noId}"><input type="radio" id="${noId}" name="attending" value="no" />${words.no}</label>
      </div>
    </div>
    <div class="field">
      <label for="${seatsId}">${words.seats}</label>
      <input class="input" type="number" id="${seatsId}" name="partySize" min="1" max="${PARTY_LIMITS.seats}" required />
    </div>
    <div class="field">
      <label for="${noteId}">${words.note}</label>
      <textarea class="input" id="${noteId}" name="note"></textarea>
    </div>
    <div class="reply-actions">
      <button class="btn btn-primary btn-small" type="submit">${words.saveReply}</button>
      <button class="btn btn-ghost btn-small" type="button">${words.cancel}</button>
    </div>`;
  const yes = /** @type {HTMLInputElement} */ (form.querySelector('[value="yes"]'));
  const no = /** @type {HTMLInputElement} */ (form.querySelector('[value="no"]'));
  const seats = /** @type {HTMLInputElement} */ (form.querySelector('[name="partySize"]'));
  const note = form.querySelector('textarea');
  const cancel = /** @type {HTMLButtonElement} */ (form.querySelector('button[type="button"]'));
  yes.checked = party.reply?.attending ?? true;
  no.checked = !yes.checked;
  seats.value = String(party.reply?.attending ? party.reply.partySize : party.defaultSeats);
  seats.disabled = !yes.checked;
  note.value = party.reply?.note ?? '';
  const answers = labels.length
    ? answerFields(labels, { prefix: `hostAnswer-${party.id}`, limit: PARTY_LIMITS.seats, lang })
    : null;
  if (answers) {
    form.querySelector('[role="radiogroup"]').replaceWith(answers.element);
    seats.closest('.field').remove();
    answers.fill(party.reply, party.defaultSeats);
  }
  // The meal counts sit before the note, and they are disabled while the reply declines.
  const meals = menu.length
    ? mealFields(menu, { prefix: `hostMeals-${party.id}`, limit: PARTY_LIMITS.seats, lang })
    : null;
  const sync = () => {
    seats.disabled = !yes.checked;
    if (meals) {
      meals.element.disabled = answers
        ? !Object.values(answers.read()).some((answer) => answer.attending)
        : !yes.checked;
    }
  };
  if (meals) {
    meals.fill(party.reply);
    note.closest('.field').before(meals.element);
  }
  sync();

  form.addEventListener('change', sync);
  cancel.addEventListener('click', () => {
    form.hidden = true;
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await writeAndReload(load, form.elements, async () => {
        const result = await client.saveHostPartyReply(cred, party.id, {
          attending: yes.checked,
          partySize: yes.checked ? seats.valueAsNumber : 0,
          answers: answers?.read(),
          meals: meals?.read(),
          note: note.value.replaceAll('\t', ' '),
          version: party.reply?.version,
        });
        return result.ok ? { ...result, message: words.replySaved } : result;
      });
    } finally {
      sync();
    }
  });
  return form;
}

async function renderParty(party, tables, page, invite, words) {
  const { client, cred, load, lang, signedIn, formatTime } = page;
  const allLabels = subEventLabels(invite, lang);
  const labels = allLabels.filter(({ id }) => party.subEvents.includes(id));
  const menu = menuLabels(invite, lang);
  const row = document.createElement('li');
  row.className = 'reply';
  const name = document.createElement('strong');
  name.textContent = party.name;
  partyHandle(name, party);
  const language = document.createElement('span');
  language.textContent = words.language[party.lang];
  const seats = document.createElement('span');
  seats.textContent = words.defaultSeats(party.defaultSeats);
  const reply = document.createElement('span');
  reply.textContent = party.reply
    ? words.answer(party.reply.attending, party.reply.partySize)
    : words[partyStatus(party)];
  row.append(name, language, seats, reply);
  if (party.reply?.attending && party.reply.partySize > party.defaultSeats) {
    const over = document.createElement('span');
    over.className = 'over-seats';
    over.textContent = words.overBy(party.reply.partySize - party.defaultSeats);
    row.append(over);
  }
  if (party.reply && labels.length) row.append(answerList(labels, party.reply, lang));
  const meals = mealLine(menu, party.reply, lang);
  if (meals) {
    const line = document.createElement('span');
    line.textContent = meals;
    row.append(line);
  }
  if (party.firstOpenedAt) {
    const opened = document.createElement('span');
    opened.textContent = `${words.firstOpened(formatTime(party.firstOpenedAt))} · ${words.lastOpened(formatTime(party.lastOpenedAt))}`;
    row.append(opened);
  }
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
  if (labels.length) {
    const copy = UI[lang].subEventReplies;
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = copy.seatsBySubEvent;
    const choice = subEventChoice(
      allLabels,
      party.subEvents,
      { legend: `${copy.invitedTo} · ${party.name}`, submit: copy.saveInvited, load, lang },
      async (ids) => {
        const result = await client.setPartySubEvents(cred, [party.id], ids);
        return result.ok ? { ...result, message: copy.invitedSaved } : result;
      },
    );
    row.append(choice, hint, tablePicker(party, tables, page));
  } else {
    row.append(seatEditor(party, { client, cred, load, lang }, menu, words), tablePicker(party, tables, page));
  }
  const actions = document.createElement('div');
  row.append(actions);
  actions.className = 'reply-actions';
  if (!signedIn) {
    const linkControls = [];
    const linkAction = (action, { label, confirm, done }) => {
      const element = button(label, () => {
        if (writing || !window.confirm(confirm)) return;
        return writeAndReload(load, linkControls, async () => {
          const result = await client.changePartyLink(cred, party.id, action, party.linkGeneration);
          return result.ok ? { ...result, message: done } : result;
        });
      });
      linkControls.push(element);
      actions.append(element);
    };
    if (!party.revoked) {
      actions.before(await personalLinkControls(party, cred, invite, words, linkControls));
      linkAction('revoke', { label: words.revoke, confirm: words.revokeConfirm, done: words.revoked });
    }
    linkAction('regenerate', { label: words.regenerate, confirm: words.regenerateConfirm, done: words.regenerated });
    const editForm = buildHostReplyForm(party, { client, cred, load, lang }, labels, menu, words);
    actions.append(
      button(words.editReply, () => {
        editForm.hidden = !editForm.hidden;
      }),
    );
    row.append(editForm);
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
      return writeAndReload(load, [element], () => client.renameParty(cred, party.id, value));
    }),
    button(words.delete, (element) => {
      if (!writing && window.confirm(words.confirmDelete(party.name))) {
        return writeAndReload(load, [element], () => client.deleteParty(cred, party.id));
      }
    }),
  );
  return { party, row };
}

async function personalLinkControls(party, cred, invite, words, linkControls) {
  const { personal: link, preview: previewUrl } = await partyInviteLinks(location.origin, cred, party);
  const message = personalMessage(party, invite, link);
  const copyMessage = button(words.copy, async () => {
    try {
      await navigator.clipboard.writeText(message);
      setStatus(words.copied);
    } catch {
      window.prompt(words.copyPrompt, message);
    }
  });
  const input = document.createElement('input');
  input.className = 'input';
  input.readOnly = true;
  input.value = link;
  linkControls.push(input, copyMessage);
  input.setAttribute('aria-label', `${words.link} · ${party.name}`);
  const controls = document.createElement('div');
  controls.className = 'copy-row';
  const preview = document.createElement('a');
  preview.className = 'btn btn-ghost btn-small';
  preview.href = await previewUrl();
  preview.target = '_blank';
  preview.rel = 'noopener';
  preview.textContent = words.preview;
  const whatsapp = document.createElement('a');
  whatsapp.className = 'btn btn-ghost btn-small';
  whatsapp.href = whatsappUrl(message);
  whatsapp.target = '_blank';
  whatsapp.rel = 'noopener noreferrer';
  whatsapp.textContent = words.whatsapp;
  controls.append(input, copyMessage, whatsapp, preview);
  return controls;
}

// An earlier open-mode reply without a party, with a picker of parties without a reply to attach it to.
function unattachedRow(reply, available, labels, menu, { client, cred, copy, lang, signedIn, load }, words) {
  const row = document.createElement('li');
  row.className = 'reply';
  const name = document.createElement('strong');
  name.textContent = reply.name;
  const answer = document.createElement('span');
  answer.textContent = reply.attending ? copy.yesCount(reply.partySize) : copy.no;
  row.append(name, answer);
  if (labels.length) row.append(answerList(labels, reply, lang));
  const meals = mealLine(menu, reply, lang);
  if (meals) {
    const line = document.createElement('span');
    line.textContent = meals;
    row.append(line);
  }
  if (reply.note) {
    const note = document.createElement('p');
    note.textContent = reply.note;
    row.append(note);
  }
  if (signedIn) return row;
  if (!available.length) {
    const hint = document.createElement('p');
    hint.className = 'hint';
    hint.textContent = words.noPartyToAttach;
    row.append(hint);
    return row;
  }
  const select = document.createElement('select');
  select.className = 'input';
  select.setAttribute('aria-label', `${words.attachTo} · ${reply.name}`);
  for (const party of available) {
    const option = document.createElement('option');
    option.value = party.id;
    option.textContent = party.name;
    select.append(option);
  }
  const attach = button(words.attach, () =>
    writeAndReload(load, [select, attach], async () => {
      const result = await client.attachReply(cred, reply.id, select.value);
      return result.ok ? { ...result, message: words.attached } : result;
    }),
  );
  const controls = document.createElement('div');
  controls.className = 'copy-row';
  controls.append(select, attach);
  row.append(controls);
  return row;
}

async function show({ parties, tables, invite, responses }, page) {
  loadedParties = parties;
  const labels = subEventLabels(invite, page.lang);
  loadedLabels = labels;
  const menu = menuLabels(invite, page.lang);
  loadedMenu = menu;
  const words = UI[page.lang].guestList;
  const rendered = await Promise.all(parties.map((party) => renderParty(party, tables, page, invite, words)));
  if (loadedParties !== parties) return;
  rows = rendered;
  renderBulkChoice(labels, page);
  const { accepted, declined, pending } = partyTotals(parties, responses);
  renderTotals(document.getElementById('partyTotals'), [
    [accepted, words.acceptedSeats(accepted)],
    [declined, words.declinedParties(declined)],
    [pending, words.pendingParties(pending)],
  ]);
  const replies = [...parties.map((party) => party.reply).filter(Boolean), ...responses];
  const tallies = partySubEventTally(
    labels.map(({ id }) => id),
    parties,
    responses,
  );
  document
    .getElementById('partyTotals')
    .append(...answerTotals(labels, tallies, page.lang), ...mealTotals(menu, replies, page.lang));
  const available = parties.filter((party) => !party.reply);
  document.getElementById('unattachedReplies').hidden = responses.length === 0;
  document
    .getElementById('unattachedList')
    .replaceChildren(...responses.map((reply) => unattachedRow(reply, available, labels, menu, page, words)));
  document.getElementById('partyList').replaceChildren(...rows.map(({ row }) => row));
  filterRows();
}

// The picker that invites every party the search and filter show to the checked sub-events. It is hidden without
// sub-events or parties.
function renderBulkChoice(labels, { client, cred, load, lang }) {
  const container = document.getElementById('bulkSubEvents');
  container.hidden = !labels.length || !rows.length;
  if (container.hidden) return container.replaceChildren();
  const copy = UI[lang].subEventReplies;
  const all = labels.map(({ id }) => id);
  container.replaceChildren(
    subEventChoice(labels, all, { legend: copy.bulkInvitedTo, submit: copy.bulkSave, load, lang }, async (ids) => {
      const shown = rows.filter(({ row }) => !row.hidden).map(({ party }) => party.id);
      if (!shown.length) return { message: copy.bulkNone };
      const result = await client.setPartySubEvents(cred, shown, ids);
      return result.ok ? { ...result, message: copy.bulkSaved(shown.length) } : result;
    }),
  );
}

export const section = { id: 'guestList', modes: ['guestList'], init, show };
