// The seating plan routes use tracker credentials and are available in guest-list mode.
// PUT /api/events/{eventId}/tables/{id} creates from {name, capacity} and returns {version} with 201.
// A repeated create returns the existing version with 200. With {version}, PUT updates and returns the next version.
// DELETE /api/events/{eventId}/tables/{id} takes {version}, unassigns its parties and returns 204.
// A stale table version gets 409. PATCH /api/events/{eventId}/parties/{id}/table takes {tableId} (null to unassign)
// and returns 204. The invitation must own both the party and the destination table.
// PATCH /api/events/{eventId}/seating takes {published} as a boolean, stores it as d.seatingPublished and returns
// {published}. While the plan is published, each party's personal link shows its table name.
import { ID_PATTERN } from '../../public/js/rsvp.js';
import { makeTable } from '../../public/js/seating.js';
import { updateSettings } from '../invitations.js';
import { assignPartyTable, requireGuestListHost } from '../parties.js';
import { bearer, json, readBody, Refusal } from './shared.js';

export const routes = [
  { pattern: /^\/api\/events\/([^/]+)\/tables\/([^/]+)$/, methods: { PUT: saveTable, DELETE: removeTable } },
  { pattern: /^\/api\/events\/([^/]+)\/parties\/([^/]+)\/table$/, methods: { PATCH: assignParty } },
  { pattern: /^\/api\/events\/([^/]+)\/seating$/, methods: { PATCH: publishPlan } },
];

async function requireTable(tx, eventId, id) {
  const {
    rows: [table],
  } = await tx.query('select version from seating_tables where id = $1 and event_id = $2', [id, eventId]);
  if (!table) throw new Refusal(404, 'tableMissing');
  return table;
}

async function saveTable({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const body = await readBody(request);
  const tableData = makeTable(body);
  if (!tableData) throw new Refusal(400, 'table');

  return db.transaction(async (tx) => {
    await requireGuestListHost(tx, eventId, secret, { modeCode: 'tableMode' });
    if (body.version === undefined) {
      const {
        rows: [created],
      } = await tx.query(
        `insert into seating_tables (id, event_id, name, capacity) values ($1, $2, $3, $4)
         on conflict (id) do nothing returning version`,
        [id, eventId, tableData.name, tableData.capacity],
      );
      if (created) return json(201, created);
      return json(200, await requireTable(tx, eventId, id));
    }
    const table = await requireTable(tx, eventId, id);
    if (body.version !== table.version) throw new Refusal(409, 'tableChanged');
    const {
      rows: [updated],
    } = await tx.query(
      `update seating_tables set name = $2, capacity = $3, version = version + 1, updated_at = now()
       where id = $1 returning version`,
      [id, tableData.name, tableData.capacity],
    );
    return json(200, updated);
  });
}

async function removeTable({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const { version } = await readBody(request);
  if (version === undefined) throw new Refusal(400, 'version');
  return db.transaction(async (tx) => {
    await requireGuestListHost(tx, eventId, secret, { modeCode: 'tableMode' });
    const table = await requireTable(tx, eventId, id);
    if (version !== table.version) throw new Refusal(409, 'tableChanged');
    await tx.query('delete from seating_tables where id = $1', [id]);
    return json(204, null);
  });
}

async function assignParty({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const { tableId } = await readBody(request);
  if (tableId !== null && (typeof tableId !== 'string' || !ID_PATTERN.test(tableId))) {
    throw new Refusal(400, 'body');
  }
  return db.transaction(async (tx) => {
    await requireGuestListHost(tx, eventId, secret, { modeCode: 'tableMode' });
    if (tableId !== null) await requireTable(tx, eventId, tableId);
    await assignPartyTable(tx, eventId, id, tableId);
    return json(204, null);
  });
}

async function publishPlan({ db, request, ids: [eventId] }) {
  const secret = bearer(request);
  const { published } = await readBody(request);
  if (typeof published !== 'boolean') throw new Refusal(400, 'body');
  return db.transaction(async (tx) => {
    const event = await requireGuestListHost(tx, eventId, secret, { modeCode: 'tableMode' });
    const updated = await updateSettings(tx, eventId, event, { seatingPublished: published });
    return json(200, updated);
  });
}
