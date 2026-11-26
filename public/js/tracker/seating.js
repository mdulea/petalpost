// Edits tables in the tracker, lists each table's parties, publishes or unpublishes the seating plan, and provides
// the picker and drag handle used in each party row. Dropping a party on a table assigns it as the picker does.
// Party drags carry the party id as PARTY_TYPE data.
import { UI } from '../i18n.js';
import { animate } from '../motion.js';
import { newId } from '../rsvp.js';
import { isSeatingPublished, TABLE_LIMITS } from '../seating.js';

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

const PARTY_TYPE = 'application/x-petalpost-party';
const LANDING = [{ transform: 'scale(1.02)' }, { transform: 'none' }];

// Saves the party's table, or null to unassign it, then reloads the tracker. Returns whether the save succeeded.
async function assign({ client, cred, load }, partyId, tableId) {
  const status = document.getElementById('partyStatus');
  status.textContent = '';
  const result = await client.assignParty(cred, partyId, tableId);
  if (!result.ok) status.textContent = result.message;
  if (result.ok || result.status === 404) await load();
  return result.ok;
}

// Makes the element a drag handle for the party. Touch and keyboard users seat parties with the picker.
export function partyHandle(element, party) {
  element.draggable = true;
  element.classList.add('drag-handle');
  element.addEventListener('dragstart', (event) => {
    event.dataTransfer.setData(PARTY_TYPE, party.id);
    event.dataTransfer.effectAllowed = 'move';
  });
}

// Saves a party's chosen table or clears its assignment. The native select supplies touch and keyboard interaction.
export function tablePicker(party, tables, page) {
  const words = UI[page.lang].seating;
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
    await assign(page, party.id, select.value || null);
    select.disabled = submit.disabled = false;
    document.getElementById(select.id)?.focus();
  });
  return form;
}

// The last loaded published state, which the publish button toggles.
let published = false;

function init(page) {
  document.getElementById('addTable').append(tableForm(page));
  document.getElementById('printSeating').addEventListener('click', () => window.print());
  const { client, cred, load } = page;
  const button = /** @type {HTMLButtonElement} */ (document.getElementById('publishSeating'));
  const status = document.getElementById('seatingStatus');
  button.addEventListener('click', async () => {
    button.disabled = true;
    status.textContent = '';
    const result = await client.setSeatingPublished(cred, !published);
    if (!result.ok) status.textContent = result.message;
    else await load();
    button.disabled = false;
  });
}

// The party's name with its accepted seats, its decline or its missing reply, as the printed plan lists it.
function partyLine(party, lang) {
  const words = UI[lang].seating;
  const answer = party.reply
    ? party.reply.attending
      ? words.partySeats(party.reply.partySize)
      : words.declined
    : UI[lang].guestList.noReply;
  return `${party.name} · ${answer}`;
}

function show({ d, tables, parties }, page) {
  const words = UI[page.lang].seating;
  published = isSeatingPublished(d);
  document.getElementById('seatingSummary').textContent = published ? words.published : words.unpublished;
  document.getElementById('publishSeating').textContent = published ? words.unpublish : words.publish;
  const rows = tables.map((table) => {
    const row = document.createElement('li');
    row.className = 'reply';
    const name = document.createElement('h3');
    name.textContent = table.name;
    const seats = document.createElement('p');
    seats.textContent = words.seats(table.filled, table.free);
    const seated = document.createElement('ul');
    seated.className = 'seated-parties';
    for (const party of parties.filter((party) => party.tableId === table.id)) {
      const item = document.createElement('li');
      item.textContent = partyLine(party, page.lang);
      seated.append(item);
    }
    row.append(name, seats, seated);
    if (table.over) {
      const over = document.createElement('strong');
      over.textContent = words.over(table.over);
      row.append(over);
    }
    row.append(tableForm(page, table));
    dropTarget(row, table, page);
    return row;
  });
  document.getElementById('seatingTables').replaceChildren(...rows);
}

// Accepts dropped parties on the table row. After the save, the reloaded row plays a short landing animation.
function dropTarget(row, table, page) {
  row.dataset.tableId = table.id;
  const carriesParty = (event) => event.dataTransfer.types.includes(PARTY_TYPE);
  row.addEventListener('dragover', (event) => {
    if (!carriesParty(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    row.classList.add('drop-target');
  });
  row.addEventListener('dragleave', (event) => {
    if (!row.contains(/** @type {Node} */ (event.relatedTarget))) row.classList.remove('drop-target');
  });
  row.addEventListener('drop', async (event) => {
    if (!carriesParty(event)) return;
    event.preventDefault();
    row.classList.remove('drop-target');
    if (!(await assign(page, event.dataTransfer.getData(PARTY_TYPE), table.id))) return;
    const landed = document.querySelector(`#seatingTables > [data-table-id="${table.id}"]`);
    if (landed) animate([landed], LANDING, { duration: 240, easing: 'ease-out' });
  });
}

export const section = { id: 'seatingPlan', modes: ['guestList'], init, show };
