// Checks that table seats count accepting replies from assigned parties only, including overfull tables.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { tableSeats } from '../public/js/seating.js';

test('table seats count accepting replies and show how many seats are free or over capacity', () => {
  const parties = [
    { tableId: 'a', reply: { attending: true, partySize: 3 } },
    { tableId: 'a', reply: { attending: true, partySize: 2 } },
    { tableId: 'a', reply: { attending: false, partySize: 0 } },
    { tableId: 'a', reply: null },
    { tableId: 'b', reply: { attending: true, partySize: 1 } },
    { tableId: null, reply: { attending: true, partySize: 8 } },
  ];
  assert.deepEqual(
    tableSeats(
      [
        { id: 'a', capacity: 4 },
        { id: 'b', capacity: 3 },
      ],
      parties,
    ),
    [
      { id: 'a', capacity: 4, filled: 5, free: 0, over: 1 },
      { id: 'b', capacity: 3, filled: 1, free: 2, over: 0 },
    ],
  );
});
