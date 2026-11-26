// The seating plan routes use tracker credentials and are available in guest-list mode.
// PUT /api/events/{eventId}/tables/{id} creates from {name, capacity} and returns {version} with 201.
// A repeated create returns the existing version with 200. With {version}, PUT updates and returns the next version.
// DELETE /api/events/{eventId}/tables/{id} takes {version}, unassigns its parties and returns 204.
// A stale table version gets 409. PATCH /api/events/{eventId}/parties/{id}/table takes {tableId} (null to unassign)
// and returns 204. The invitation must own both the party and the destination table.
// PATCH /api/events/{eventId}/seating takes {published} as a boolean, stores it as d.seatingPublished and returns
// {published}. While the plan is published, each party's personal link shows its table name.
import { modeOf } from '../../public/js/invite.js';
import { ID_PATTERN } from '../../public/js/rsvp.js';
import { TABLE_LIMITS } from '../../public/js/seating.js';
import { bearer, json, ownedEvent, readBody, Refusal } from './shared.js';

export const routes = [
  { pattern: /^\/api\/events\/([^/]+)\/tables\/([^/]+)$/, methods: { PUT: saveTable, DELETE: removeTable } },
  { pattern: /^\/api\/events\/([^/]+)\/parties\/([^/]+)\/table$/, methods: { PATCH: assignParty } },
  { pattern: /^\/api\/events\/([^/]+)\/seating$/, methods: { PATCH: publishPlan } },
];

// Reads the invitation's tables in creation order without taking write locks.
export async function listTables(db, eventId) {
  const { rows } = await db.query(
    'select id, name, capacity, version from seating_tables where event_id = $1 order by created_at, id',
    [eventId],
  );
  return rows;
}

// Locks the invitation first so table writes, assignments and invitation deletion take turns.
async function ownedPlan(tx, eventId, secret) {
  const event = await ownedEvent(tx, eventId, secret);
  if (modeOf(event.d) !== 'guestList') throw new Refusal(403, 'tableMode');
  return event;
}

async function requireTable(tx, eventId, id) {
  const {
    rows: [table],
  } = await tx.query('select version from seating_tables where id = $1 and event_id = $2', [id, eventId]);
  if (!table) throw new Refusal(404, 'tableMissing');
  return table;
}

async function saveTable({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const { name, capacity, version } = await readBody(request);
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (
    !trimmed ||
    [...trimmed].length > TABLE_LIMITS.name ||
    /\p{Cc}/u.test(trimmed) ||
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    capacity > TABLE_LIMITS.capacity
  )
    throw new Refusal(400, 'table');

  return db.transaction(async (tx) => {
    await ownedPlan(tx, eventId, secret);
    if (version === undefined) {
      const {
        rows: [created],
      } = await tx.query(
        `insert into seating_tables (id, event_id, name, capacity) values ($1, $2, $3, $4)
         on conflict (id) do nothing returning version`,
        [id, eventId, trimmed, capacity],
      );
      if (created) return json(201, created);
      return json(200, await requireTable(tx, eventId, id));
    }
    const table = await requireTable(tx, eventId, id);
    if (version !== table.version) throw new Refusal(409, 'tableChanged');
    const {
      rows: [updated],
    } = await tx.query(
      `update seating_tables set name = $2, capacity = $3, version = version + 1, updated_at = now()
       where id = $1 returning version`,
      [id, trimmed, capacity],
    );
    return json(200, updated);
  });
}

async function removeTable({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const { version } = await readBody(request);
  if (version === undefined) throw new Refusal(400, 'version');
  return db.transaction(async (tx) => {
    await ownedPlan(tx, eventId, secret);
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
    await ownedPlan(tx, eventId, secret);
    if (tableId !== null) await requireTable(tx, eventId, tableId);
    const { rows } = await tx.query('update parties set table_id = $3 where event_id = $1 and id = $2 returning id', [
      eventId,
      id,
      tableId,
    ]);
    if (!rows.length) throw new Refusal(404, 'personalLink');
    return json(204, null);
  });
}

async function publishPlan({ db, request, ids: [eventId] }) {
  const secret = bearer(request);
  const { published } = await readBody(request);
  if (typeof published !== 'boolean') throw new Refusal(400, 'body');
  return db.transaction(async (tx) => {
    const { d } = await ownedPlan(tx, eventId, secret);
    const next = { ...d };
    if (published) next.seatingPublished = true;
    else delete next.seatingPublished;
    await tx.query('update events set d = $2::text::jsonb, updated_at = now() where id = $1', [
      eventId,
      JSON.stringify(next),
    ]);
    return json(200, { published });
  });
}
