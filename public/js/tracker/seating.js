// Edits tables in the tracker and provides the picker used in each party row.
import { UI } from '../i18n.js';
import { newId } from '../rsvp.js';
import { TABLE_LIMITS } from '../seating.js';

function field(labelText, control) {
  const container = document.createElement('div');
  container.className = 'field';
  const label = document.createElement('label');
  label.textContent = labelText;
  label.htmlFor = control.id;
  control.className = 'input';
  container.append(label, control);
  return container;
}

function submitButton(text, primary = false) {
  const button = document.createElement('button');
  button.type = 'submit';
  button.className = `btn btn-${primary ? 'primary' : 'ghost'} btn-small`;
  button.textContent = text;
  return button;
}

function tableForm({ client, cred, lang, load }, table) {
  const words = UI[lang].seating;
  const status = document.getElementById('seatingStatus');
  const form = document.createElement('form');
  const name = document.createElement('input');
  name.id = `table-name-${table?.id ?? 'new'}`;
  name.required = true;
  name.value = table?.name ?? '';
  const capacity = document.createElement('input');
  capacity.id = `table-capacity-${table?.id ?? 'new'}`;
  capacity.type = 'number';
  capacity.min = '1';
  capacity.max = String(TABLE_LIMITS.capacity);
  capacity.required = true;
  capacity.value = table ? String(table.capacity) : '1';
  const save = submitButton(table ? words.save : words.add, !table);
  const actions = document.createElement('div');
  actions.className = 'reply-actions';
  actions.append(save);
  const remove = submitButton(words.remove);
  remove.formNoValidate = true;
  if (table) actions.append(remove);
  form.setAttribute('aria-label', table?.name ?? words.add);
  form.append(field(words.name, name), field(words.capacity, capacity), actions);

  let pendingId = table?.id ?? newId();
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const deleting = event.submitter === remove;
    if (deleting && !window.confirm(words.removeConfirm)) return;
    for (const control of form.elements) control.setAttribute('disabled', '');
    status.textContent = '';
    const result = deleting
      ? await client.removeTable(cred, pendingId, table.version)
      : await client.saveTable(cred, pendingId, {
          name: name.value,
          capacity: capacity.valueAsNumber,
          version: table?.version,
        });
    if (!result.ok) status.textContent = result.message;
    if (result.ok && !table) {
      pendingId = newId();
      form.reset();
    }
    if (result.ok || result.status === 409 || result.status === 404) await load();
    for (const control of form.elements) control.removeAttribute('disabled');
    (document.getElementById(name.id) ?? document.getElementById('table-name-new'))?.focus();
  });
  return form;
}

// Saves a party's chosen table or clears its assignment. The native select supplies touch and keyboard interaction.
export function tablePicker(party, tables, { client, cred, lang, load }) {
  const words = UI[lang].seating;
  const status = document.getElementById('partyStatus');
  const form = document.createElement('form');
  const select = document.createElement('select');
  select.id = `party-table-${party.id}`;
  select.setAttribute('aria-label', `${words.picker} · ${party.name}`);
  select.add(new Option(words.unassigned, ''));
  for (const table of tables) select.add(new Option(table.name, table.id));
  select.value = tables.some((table) => table.id === party.tableId) ? party.tableId : '';
  const submit = submitButton(words.move);
  form.append(field(words.picker, select), submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    select.disabled = submit.disabled = true;
    status.textContent = '';
    const result = await client.assignParty(cred, party.id, select.value || null);
    if (!result.ok) status.textContent = result.message;
    if (result.ok || result.status === 404) await load();
    select.disabled = submit.disabled = false;
    document.getElementById(select.id)?.focus();
  });
  return form;
}

function init(page) {
  document.getElementById('addTable').append(tableForm(page));
}

function show({ tables }, page) {
  const words = UI[page.lang].seating;
  const rows = tables.map((table) => {
    const row = document.createElement('li');
    row.className = 'reply';
    const seats = document.createElement('p');
    seats.textContent = words.seats(table.filled, table.free);
    row.append(seats);
    if (table.over) {
      const over = document.createElement('strong');
      over.textContent = words.over(table.over);
      row.append(over);
    }
    row.append(tableForm(page, table));
    return row;
  });
  document.getElementById('seatingTables').replaceChildren(...rows);
}

export const section = { id: 'seatingPlan', modes: ['guestList'], init, show };
