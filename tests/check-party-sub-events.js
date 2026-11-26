// Fails when inviting a party to a subset of the sub-events breaks. Checks: the sub-event ids of a party, where the
// default empty list and a list without a current sub-event invite the party to all of them; the invitation a party
// sees, with only its sub-events; a reply narrowed to the party's sub-events; the totals of each sub-event over the
// invited parties, with the invited parties without a reply; choosing the sub-events of one party and of many parties
// through the API, where a choice of every sub-event is stored as the default and a later sub-event joins it; the
// refusals of an empty, unknown or repeated choice, an unknown party, an open invitation and an invitation without
// sub-events; the personal link and the view link in English and Romanian, which show only the party's sub-events and
// refuse an answer to another sub-event; the host's reply form; and the tracker's party list and totals, which count
// only the invited parties.
// Each API test uses fresh random ids and client IPs in the shared migrated in-memory PGlite database of
// tests/api-setup.js.
// Run: pnpm exec node tests/check-party-sub-events.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { partySubEventTally } from '../public/js/guest-list.js';
import { makeInviteData, partyInvite, partySubEventIds, subEventIds } from '../public/js/invite.js';
import { newId, PARTY_LIMITS, partyLinkSecret, partyReply, viewLinkSecret } from '../public/js/rsvp.js';
import { getTemplate } from '../public/js/templates.js';
import { host, setup } from './api-setup.js';

const civil = { id: 'civil', name: 'Civil ceremony', date: '2027-06-12', time: '11:00', venue: 'City Hall' };
const church = { id: 'church', name: 'Church', date: '2027-06-12', time: '14:00', venue: '' };
const dinner = { id: 'dinner', name: 'Dinner', date: '2027-06-13', time: '19:00', venue: 'Lake House' };
const wedding = (subEvents, lang = 'en') => ({
  t: 'wedding',
  d: makeInviteData(getTemplate('wedding', lang), { title: 'Ana & Mihai', mode: 'guestList', subEvents }, lang),
});
const yes = (partySize) => ({ attending: true, partySize });
const no = { attending: false, partySize: 0 };

test('a party gets its chosen sub-events in invitation order, and all of them by default', () => {
  const { d } = wedding([civil, church, dinner]);
  assert.deepEqual(partySubEventIds(d, ['dinner', 'civil']), ['civil', 'dinner']);
  assert.deepEqual(partySubEventIds(d, []), ['civil', 'church', 'dinner']);
  assert.deepEqual(partySubEventIds(d, ['removed']), ['civil', 'church', 'dinner']);
  assert.deepEqual(partySubEventIds(wedding(undefined).d, ['civil']), []);
  assert.deepEqual(
    partyInvite(d, ['church']).subEvents.map(({ id }) => id),
    ['church'],
  );
  const withoutSubEvents = wedding(undefined).d;
  assert.equal(partyInvite(withoutSubEvents, ['civil']), withoutSubEvents);
  // A sub-event stored before sub-events had ids keeps its position as its id.
  const { id: _civil, ...oldCivil } = civil;
  const { id: _church, ...oldChurch } = church;
  assert.deepEqual(partyInvite({ subEvents: [oldCivil, oldChurch] }, ['2']).subEvents, [{ ...oldChurch, id: '2' }]);
});

test('a reply keeps only its answers to the party sub-events and derives its answer from them', () => {
  const reply = { attending: true, partySize: 4, answers: { civil: no, church: yes(2), dinner: yes(4) }, note: '' };
  assert.deepEqual(partyReply(reply, ['civil', 'church']), {
    attending: true,
    partySize: 2,
    answers: { civil: no, church: yes(2) },
    note: '',
  });
  assert.deepEqual(partyReply(reply, ['civil']), { attending: false, partySize: 0, answers: { civil: no }, note: '' });
  assert.deepEqual(partyReply(reply, ['added']), { attending: true, partySize: 4, note: '' });
  assert.equal(partyReply(null, ['civil']), null);
  const single = { attending: true, partySize: 2, note: '' };
  assert.equal(partyReply(single, ['civil']), single);
});

test('the totals of each sub-event count only the invited parties and the invited parties without a reply', () => {
  const parties = [
    { subEvents: ['civil', 'dinner'], reply: { answers: { civil: yes(2), dinner: yes(3) } } },
    { subEvents: ['dinner'], reply: { answers: { dinner: no } } },
    { subEvents: ['civil', 'dinner'], reply: null },
    { subEvents: ['dinner'], reply: null },
  ];
  const unattached = [{ answers: { civil: yes(1) } }];
  assert.deepEqual(partySubEventTally(['civil', 'dinner'], parties, unattached), [
    { id: 'civil', yes: 2, no: 0, attending: 3, unanswered: 0, pending: 1 },
    { id: 'dinner', yes: 1, no: 1, attending: 3, unanswered: 1, pending: 2 },
  ]);
});

// A published guest-list wedding with the parties of names, and the personal and view credentials of each.
async function guestList(subEvents, names, lang = 'en') {
  const { client, db } = await setup();
  const tracker = client(newId(), lang);
  const cred = host();
  await tracker.publish(cred, wedding(subEvents, lang));
  const parties = [];
  for (const name of names) {
    const id = newId();
    await tracker.addParty(cred, id, { name, defaultSeats: 4 });
    const secret = await partyLinkSecret(cred.secret, id, 'personal');
    parties.push({
      id,
      personal: { id, secret, version: undefined },
      view: { id, secret: await viewLinkSecret(secret, id) },
    });
  }
  return { client, db, tracker, cred, parties };
}

for (const lang of ['en', 'ro']) {
  test(`in ${lang}, the personal link and the view link show only the party sub-events and refuse an answer to another`, async () => {
    const { client, tracker, cred, parties } = await guestList([civil, church, dinner], ['Familia Popescu'], lang);
    const [{ id, personal, view }] = parties;
    assert.equal((await tracker.setPartySubEvents(cred, [id], ['dinner', 'civil'])).status, 204);
    const guests = client(newId(), lang);
    const opened = (await guests.loadParty(cred.id, personal)).data;
    assert.deepEqual(subEventIds(opened.d), ['civil', 'dinner']);
    assert.deepEqual(subEventIds((await guests.loadPartyView(cred.id, view)).data.d), ['civil', 'dinner']);
    // An answer to a sub-event of another party gets the refusal of a missing answer.
    const missing = await guests.savePartyReply(cred.id, personal, { answers: { civil: yes(2) } });
    assert.equal(missing.status, 400);
    const extra = await guests.savePartyReply(cred.id, personal, {
      answers: { civil: yes(2), church: yes(2), dinner: no },
    });
    assert.deepEqual([extra.status, extra.message], [400, missing.message]);
    const answers = { civil: yes(2), dinner: no };
    const saved = await guests.savePartyReply(cred.id, personal, { answers });
    assert.equal(saved.status, 201);
    assert.deepEqual((await guests.loadParty(cred.id, personal)).data.reply.answers, answers);
    const hostExtra = await tracker.saveHostPartyReply(cred, id, {
      answers: { ...answers, church: no },
      version: saved.data.version,
    });
    assert.equal(hostExtra.status, 400);
    const hostEdit = await tracker.saveHostPartyReply(cred, id, {
      answers: { civil: no, dinner: yes(3) },
      version: saved.data.version,
    });
    assert.equal(hostEdit.status, 200);
  });
}

test('the host invites many parties at once, and a choice of every sub-event follows a later sub-event', async () => {
  const { db, tracker, cred, parties } = await guestList([civil, church], ['Ana', 'Ion', 'Maria']);
  const [ana, ion, maria] = parties.map(({ id }) => id);
  assert.equal((await tracker.setPartySubEvents(cred, [ana, ion], ['church'])).status, 204);
  const listed = async () =>
    Object.fromEntries((await tracker.loadResponses(cred)).data.parties.map((p) => [p.id, p.subEvents]));
  assert.deepEqual(await listed(), { [ana]: ['church'], [ion]: ['church'], [maria]: ['civil', 'church'] });
  assert.equal((await tracker.setPartySubEvents(cred, [ion], ['church', 'civil'])).status, 204);
  const stored = await db.query('select sub_events from parties where id = $1', [ion]);
  assert.deepEqual(stored.rows[0].sub_events, []);
  cred.version = 1;
  await tracker.publish(cred, wedding([civil, church, dinner]));
  assert.deepEqual(await listed(), {
    [ana]: ['church'],
    [ion]: ['civil', 'church', 'dinner'],
    [maria]: ['civil', 'church', 'dinner'],
  });
});

test('the API refuses an empty, unknown or repeated choice, an unknown party and an open invitation', async () => {
  const { client, tracker, cred, parties } = await guestList([civil, church], ['Ana']);
  const [{ id }] = parties;
  const status = async (ids, subEvents, owner = cred) =>
    (await tracker.setPartySubEvents(owner, ids, subEvents)).status;
  assert.equal(await status([id], []), 400);
  assert.equal(await status([id], ['dinner']), 400);
  assert.equal(await status([id], ['civil', 'civil']), 400);
  assert.equal(await status([], ['civil']), 400);
  assert.equal(await status([id, id], ['civil']), 400);
  assert.equal(await status(['short'], ['civil']), 400);
  assert.equal(await status([id, newId()], ['civil']), 404);
  assert.equal(await status([id], ['civil'], { ...cred, secret: host().secret }), 403);
  const open = host();
  await client().publish(open, { ...wedding([civil]), d: { ...wedding([civil]).d, mode: 'open' } });
  assert.equal(await status([id], ['civil'], open), 403);
  const plain = await guestList(undefined, ['Ion']);
  assert.equal((await plain.tracker.setPartySubEvents(plain.cred, [plain.parties[0].id], ['1'])).status, 400);
});

test('a choice for the largest guest list fits in one request', async () => {
  const { tracker, cred } = await guestList([civil, church], []);
  const ids = Array.from({ length: PARTY_LIMITS.count }, () => newId());
  // Unknown parties get 404, which the server sends only after it reads the whole body.
  assert.equal((await tracker.setPartySubEvents(cred, ids, ['civil'])).status, 404);
});

test('the tracker narrows replies to the party sub-events and counts only the invited parties', async () => {
  const { client, tracker, cred, parties } = await guestList([civil, dinner], ['Ana', 'Ion', 'Maria']);
  const [ana, ion, maria] = parties;
  const guests = client(newId());
  const saved = await guests.savePartyReply(cred.id, ana.personal, { answers: { civil: yes(2), dinner: yes(4) } });
  assert.equal(saved.status, 201);
  await guests.savePartyReply(cred.id, ion.personal, { answers: { civil: no, dinner: yes(1) } });
  // The host narrows Ana to the civil ceremony after her reply, and Maria to the dinner.
  await tracker.setPartySubEvents(cred, [ana.id], ['civil']);
  await tracker.setPartySubEvents(cred, [maria.id], ['dinner']);
  const listed = (await tracker.loadResponses(cred)).data.parties;
  const anaListed = listed.find((p) => p.id === ana.id);
  assert.deepEqual([anaListed.reply.answers, anaListed.reply.partySize], [{ civil: yes(2) }, 2]);
  assert.deepEqual(partySubEventTally(['civil', 'dinner'], listed), [
    { id: 'civil', yes: 1, no: 1, attending: 2, unanswered: 0, pending: 0 },
    { id: 'dinner', yes: 1, no: 0, attending: 1, unanswered: 0, pending: 1 },
  ]);
});
