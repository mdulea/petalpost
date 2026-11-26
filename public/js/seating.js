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
export const TABLE_LIMITS = { name: 80, capacity: 2_147_483_647 };
