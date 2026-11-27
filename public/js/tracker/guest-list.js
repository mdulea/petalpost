// Edits the guest list and renders its parties, replies, earlier unattached replies, totals and personal links.
// All mutations run through page.runAction so writes serialize across every tracker section. Party personal links are
// pre-derived once per load by manage.js on party.links, and preview view links are derived lazily on click.
import { guestListCsv, guestListCsvName } from '../csv.js';
import { normalizePartySearch, partyMatches, partySubEventTally, partyTotals, validPartyName } from '../guest-list.js';
import { UI } from '../i18n.js';
import { menuLabels, personalMessage, subEventLabels, whatsappUrl } from '../invite.js';
import { createMealFields, createReplyFields } from '../reply-fields.js';
import { mealLine } from '../reply-format.js';
import { PARTY_LIMITS, partyStatus } from '../rsvp.js';
import { applyBatchResult, prepareBatch } from './batch-parties.js';
import { downloadCsv } from './download.js';
import { answerList, answerTotals, mealTotals } from './reply-summary.js';
import { partyHandle, tablePicker } from './seating.js';
import { renderTotals } from './totals.js';

let loadedParties = [];
let loadedLabels = [];
let loadedMenu = [];
let rows = [];

const setStatus = (message) => {
  document.getElementById('partyStatus').textContent = message;
};

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

function init(page) {
  const { client, cred, lang, load, signedIn, runAction } = page;
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

  let retry = null;
  let batchState = { locked: false, reset: false, remainingText: '' };

  function syncBatchForm() {
    namesInput.readOnly = seats.readOnly = batchState.locked;
    language.disabled = batchState.locked;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const prepared = prepareBatch(retry, {
      text: namesInput.value,
      defaultSeats: seats.valueAsNumber,
      lang: language.value,
      existingCount: loadedParties.length,
    });
    if (!prepared.ok) {
      setStatus(
        prepared.error === 'invalidName' ? words.invalidName(PARTY_LIMITS.name) : words.limit(PARTY_LIMITS.count),
      );
      return;
    }
    const { batch } = prepared;
    await runAction({
      controls: form.elements,
      setStatus,
      action: async () => {
        const result = await client.addParties(cred, batch.entries, batch.defaultSeats, batch.lang);
        const next = applyBatchResult(batch, result);
        retry = next.retry;
        batchState = next;
        if (next.reset) {
          form.reset();
          return result;
        }
        namesInput.value = next.remainingText;
        const message = [result.message, next.partial ? words.partial : '', next.retryable ? words.retryPaste : '']
          .filter(Boolean)
          .join(' ');
        return { ...result, message };
      },
      afterUnlock: syncBatchForm,
    });
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

// A form with one checkbox for each sub-event of labels, checked for the ids in checked, and a submit button.
function subEventChoice(labels, checked, { legend, submit, lang, runAction }, save) {
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
  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.className = 'btn btn-ghost btn-small';
  submitBtn.textContent = submit;
  fieldset.append(title, choices, submitBtn);
  form.append(fieldset);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const ids = boxes.filter((box) => box.checked).map((box) => box.value);
    if (!ids.length) return setStatus(copy.chooseOne);
    return runAction({ controls: form.elements, setStatus, action: () => save(ids) });
  });
  return form;
}

// With menu options, the meal counts come before the seats, and they are disabled while the seats are 0.
function seatEditor(party, { client, cred, lang, runAction }, menu, words) {
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
    ? createMealFields(menu, { prefix: `seatMeals-${party.id}`, limit: PARTY_LIMITS.seats, lang })
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
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    return runAction({
      controls: form.elements,
      setStatus,
      action: async () => {
        const result = await client.setPartySeats(cred, party.id, {
          partySize: input.valueAsNumber,
          meals: meals?.read(),
          version: party.reply?.version,
        });
        return result.ok ? { ...result, message: words.seatsSaved } : result;
      },
      afterUnlock: sync,
    });
  });
  return form;
}

function buildHostReplyForm(party, { client, cred, lang, runAction }, labels, menu, words) {
  const form = document.createElement('form');
  form.hidden = true;
  form.autocomplete = 'off';
  form.noValidate = true;
  const replyFields = createReplyFields({
    lang,
    limit: PARTY_LIMITS.seats,
    subEvents: labels,
    menu,
    prefix: `host-${party.id}`,
    answerPrefix: `hostAnswer-${party.id}`,
    mealPrefix: `hostMeals-${party.id}`,
    ids: {
      yes: `hostYes-${party.id}`,
      no: `hostNo-${party.id}`,
      seats: `hostSeats-${party.id}`,
      note: `hostNote-${party.id}`,
    },
    copy: {
      attending: words.attending,
      yes: words.yes,
      no: words.no,
      seats: words.seats,
      note: words.note,
    },
  });
  const actions = document.createElement('div');
  actions.className = 'reply-actions';
  const submit = document.createElement('button');
  submit.className = 'btn btn-primary btn-small';
  submit.type = 'submit';
  submit.textContent = words.saveReply;
  const cancel = document.createElement('button');
  cancel.className = 'btn btn-ghost btn-small';
  cancel.type = 'button';
  cancel.textContent = words.cancel;
  actions.append(submit, cancel);
  form.append(replyFields.fragment, actions);
  replyFields.bind(form);
  replyFields.fill(party.reply, party.defaultSeats);

  cancel.addEventListener('click', () => {
    form.hidden = true;
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const { reply, errorMessage, focusTarget } = replyFields.validate(party.name);
    if (!reply) {
      setStatus(errorMessage);
      focusTarget?.focus();
      return;
    }
    return runAction({
      controls: form.elements,
      setStatus,
      action: async () => {
        const result = await client.saveHostPartyReply(cred, party.id, {
          ...reply,
          version: party.reply?.version,
        });
        return result.ok ? { ...result, message: words.replySaved } : result;
      },
      afterUnlock: replyFields.sync,
    });
  });
  return form;
}

function personalLinkControls(party, invite, words, linkControls) {
  const { personal: link, preview: derivePreview } = party.links;
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
  preview.href = '#';
  preview.target = '_blank';
  preview.rel = 'noopener';
  preview.textContent = words.preview;
  /** @type {Promise<string> | null} */
  let pendingPreview = null;
  const ensurePreviewHref = () => {
    if (!pendingPreview) {
      pendingPreview = derivePreview().then((url) => {
        preview.href = url;
        preview.dataset.ready = '1';
        return url;
      });
    }
    return pendingPreview;
  };
  for (const eventName of ['pointerenter', 'focus', 'contextmenu', 'auxclick']) {
    preview.addEventListener(eventName, () => {
      void ensurePreviewHref();
    });
  }
  preview.addEventListener('click', async (event) => {
    if (preview.dataset.ready === '1') return;
    event.preventDefault();
    const url = await ensurePreviewHref();
    window.open(url, '_blank', 'noopener');
  });
  const whatsapp = document.createElement('a');
  whatsapp.className = 'btn btn-ghost btn-small';
  whatsapp.href = whatsappUrl(message);
  whatsapp.target = '_blank';
  whatsapp.rel = 'noopener noreferrer';
  whatsapp.textContent = words.whatsapp;
  controls.append(input, copyMessage, whatsapp, preview);
  return controls;
}

function renderParty(party, tables, page, invite, words) {
  const { client, cred, lang, signedIn, formatTime, runAction } = page;
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
      { legend: `${copy.invitedTo} · ${party.name}`, submit: copy.saveInvited, lang, runAction },
      async (ids) => {
        const result = await client.setPartySubEvents(cred, [party.id], ids);
        return result.ok ? { ...result, message: copy.invitedSaved } : result;
      },
    );
    row.append(choice, hint, tablePicker(party, tables, page));
  } else {
    row.append(seatEditor(party, page, menu, words), tablePicker(party, tables, page));
  }
  const actions = document.createElement('div');
  row.append(actions);
  actions.className = 'reply-actions';
  if (!signedIn) {
    const linkControls = [];
    const linkAction = (action, { label, confirm, done }) => {
      const element = button(label, () => {
        if (!window.confirm(confirm)) return;
        return runAction({
          controls: linkControls,
          setStatus,
          action: async () => {
            const result = await client.changePartyLink(cred, party.id, action, party.linkGeneration);
            return result.ok ? { ...result, message: done } : result;
          },
        });
      });
      linkControls.push(element);
      actions.append(element);
    };
    if (!party.revoked && party.links) {
      actions.before(personalLinkControls(party, invite, words, linkControls));
      linkAction('revoke', { label: words.revoke, confirm: words.revokeConfirm, done: words.revoked });
    }
    linkAction('regenerate', { label: words.regenerate, confirm: words.regenerateConfirm, done: words.regenerated });
    const editForm = buildHostReplyForm(party, page, labels, menu, words);
    actions.append(
      button(words.editReply, () => {
        editForm.hidden = !editForm.hidden;
      }),
    );
    row.append(editForm);
  }
  actions.append(
    button(words.rename, (element) => {
      const value = window.prompt(words.renamePrompt, party.name)?.trim();
      if (value === undefined || value === party.name) return;
      if (!validPartyName(value)) {
        setStatus(words.renameInvalid(PARTY_LIMITS.name));
        return;
      }
      return runAction({ controls: [element], setStatus, action: () => client.renameParty(cred, party.id, value) });
    }),
    button(words.delete, (element) => {
      if (window.confirm(words.confirmDelete(party.name))) {
        return runAction({ controls: [element], setStatus, action: () => client.deleteParty(cred, party.id) });
      }
    }),
  );
  return { party, row };
}

// An earlier open-mode reply without a party, with a picker of parties without a reply to attach it to.
function unattachedRow(reply, available, labels, menu, { client, cred, copy, lang, signedIn, runAction }, words) {
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
    runAction({
      controls: [select, attach],
      setStatus,
      action: async () => {
        const result = await client.attachReply(cred, reply.id, select.value);
        return result.ok ? { ...result, message: words.attached } : result;
      },
    }),
  );
  const controls = document.createElement('div');
  controls.className = 'copy-row';
  controls.append(select, attach);
  row.append(controls);
  return row;
}

function show({ parties, tables, invite, responses }, page) {
  loadedParties = parties;
  const labels = subEventLabels(invite, page.lang);
  loadedLabels = labels;
  const menu = menuLabels(invite, page.lang);
  loadedMenu = menu;
  const words = UI[page.lang].guestList;
  rows = parties.map((party) => renderParty(party, tables, page, invite, words));
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
function renderBulkChoice(labels, { client, cred, lang, runAction }) {
  const container = document.getElementById('bulkSubEvents');
  container.hidden = !labels.length || !rows.length;
  if (container.hidden) return container.replaceChildren();
  const copy = UI[lang].subEventReplies;
  const all = labels.map(({ id }) => id);
  container.replaceChildren(
    subEventChoice(labels, all, { legend: copy.bulkInvitedTo, submit: copy.bulkSave, lang, runAction }, async (ids) => {
      const shown = rows.filter(({ row }) => !row.hidden).map(({ party }) => party.id);
      if (!shown.length) return { message: copy.bulkNone };
      const result = await client.setPartySubEvents(cred, shown, ids);
      return result.ok ? { ...result, message: copy.bulkSaved(shown.length) } : result;
    }),
  );
}

export const section = { id: 'guestList', modes: ['guestList'], init, show };
