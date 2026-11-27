// Adds filled, free and over-capacity seat counts to each table using accepting replies from assigned parties.
export function tableSeats(tables, parties) {
  const filledByTable = new Map();
  for (const { tableId, reply } of parties) {
    if (tableId && reply?.attending) {
      filledByTable.set(tableId, (filledByTable.get(tableId) ?? 0) + reply.partySize);
    }
  }
  return tables.map((table) => {
    const filled = filledByTable.get(table.id) ?? 0;
    return { ...table, filled, free: Math.max(0, table.capacity - filled), over: Math.max(0, filled - table.capacity) };
  });
}
// True while the host has published the seating plan stored in the invitation content d.
export const isSeatingPublished = (d) => d?.seatingPublished === true;
export const TABLE_LIMITS = { name: 80, capacity: 2_147_483_647 };

// Validates an untrusted {name, capacity} table input: trimmed name of 1 to TABLE_LIMITS.name code points without
// control characters and an integer capacity from 1 to TABLE_LIMITS.capacity. Returns {name, capacity} or null.
export function makeTable(source) {
  if (!source || typeof source !== 'object') return null;
  const trimmed = typeof source.name === 'string' ? source.name.trim() : '';
  const { capacity } = source;
  if (
    !trimmed ||
    [...trimmed].length > TABLE_LIMITS.name ||
    /\p{Cc}/u.test(trimmed) ||
    !Number.isInteger(capacity) ||
    capacity < 1 ||
    capacity > TABLE_LIMITS.capacity
  ) {
    return null;
  }
  return { name: trimmed, capacity };
}
