// Checks seat counts from accepting replies, table edits, assignment, removal and invitation ownership.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { newId, partyLinkSecret } from '../public/js/rsvp.js';
import { tableSeats } from '../public/js/seating.js';
import { host, party, setup } from './api-setup.js';

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

test('the tracker reads the seating plan as parties reply, the host resizes a table, and the table is removed', async () => {
  const { client, raw } = await setup();
  const tracker = client();
  const cred = host();
  const other = host();
  for (const invitation of [cred, other]) {
    await tracker.publish(invitation, { ...party, d: { ...party.d, mode: 'guestList' } });
  }
  const tableId = newId();
  const partyId = newId();
  const otherPartyId = newId();
  const table = (invitation) => `/api/events/${invitation.id}/tables/${tableId}`;
  const assignment = (invitation, id = partyId) => `/api/events/${invitation.id}/parties/${id}/table`;
  const request = (invitation, path, method, body) =>
    raw(path, { method, headers: { authorization: `Bearer ${invitation.secret}` }, body: JSON.stringify(body) });
  const read = async () => (await tracker.loadResponses(cred)).data;

  assert.equal((await request(cred, table(cred), 'PUT', { name: '  7  ', capacity: 2 })).status, 201);
  assert.equal((await request(cred, table(cred), 'PUT', { name: '7', capacity: 2 })).status, 200);
  assert.deepEqual((await read()).tables, [
    { id: tableId, name: '7', capacity: 2, version: 1, filled: 0, free: 2, over: 0 },
  ]);
  await tracker.addParty(cred, partyId, { name: 'Familia Radu', defaultSeats: 4 });
  await tracker.addParty(other, otherPartyId, { name: 'Sam', defaultSeats: 2 });
  assert.equal((await request(other, table(other), 'DELETE', { version: 1 })).status, 404);
  assert.equal((await request(other, assignment(other, otherPartyId), 'PATCH', { tableId })).status, 404);
  assert.equal((await request(cred, assignment(cred, otherPartyId), 'PATCH', { tableId })).status, 404);
  assert.equal((await request(cred, assignment(cred), 'PATCH', { tableId })).status, 204);
  const personal = { id: partyId, secret: await partyLinkSecret(cred.secret, partyId, 'personal') };
  assert.equal((await tracker.savePartyReply(cred.id, personal, { attending: true, partySize: 3 })).status, 201);
  assert.equal((await read()).tables[0].over, 1);
  assert.equal((await request(cred, table(cred), 'PUT', { name: 'Window', capacity: 0, version: 1 })).status, 400);
  assert.equal((await request(cred, table(cred), 'PUT', { name: 'Window', capacity: 4, version: 1 })).status, 200);
  assert.equal((await request(cred, table(cred), 'DELETE', { version: 1 })).status, 409);
  const resized = await read();
  assert.deepEqual(resized.tables, [
    { id: tableId, name: 'Window', capacity: 4, version: 2, filled: 3, free: 1, over: 0 },
  ]);
  assert.equal(resized.parties[0].tableId, tableId);
  assert.equal((await request(cred, table(cred), 'DELETE', { version: 2 })).status, 204);
  const removed = await read();
  assert.deepEqual(removed.tables, []);
  assert.equal(removed.parties[0].tableId, null);
  assert.equal(removed.parties[0].reply.partySize, 3);
});
