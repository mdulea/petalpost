// Fails when the answers of a reply to each sub-event break. Checks: sub-event ids, which a record keeps through edits
// and moves, which default to the position for a sub-event stored without one and which readPublished refuses when
// malformed or repeated; makeReply with sub-events, which needs exactly one valid answer for each sub-event and derives
// the reply's answer and party size; the totals of each sub-event; open-mode replies through the API in English and
// Romanian, with answers in the reply edit link and management reads and a refused reply that misses a sub-event; a
// reply saved before the host added sub-events, which shows no answer to them; an invitation stored before sub-events
// had ids; personal-link and host replies of a guest-list party, and the seat editor refused with sub-events; the
// replies CSV and the guest-list CSV with a column pair for each sub-event and a totals row in English and Romanian.
// Each API test uses fresh random ids and client IPs in the shared migrated in-memory PGlite database of
// tests/api-setup.js.
// Run: pnpm exec node tests/check-sub-event-replies.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guestListCsv, repliesCsv } from '../public/js/csv.js';
import {
  addSubEvent,
  makeInviteData,
  moveSubEvent,
  readPublished,
  subEventIds,
  subEventLabels,
} from '../public/js/invite.js';
import { makeReply, newId, partyLinkSecret, subEventTally } from '../public/js/rsvp.js';
import { getTemplate } from '../public/js/templates.js';
import { guest, host, setup } from './api-setup.js';

const civil = { id: 'civil', name: 'Civil ceremony', date: '2027-06-12', time: '11:00', venue: 'City Hall' };
const church = { id: 'church', name: 'Church', date: '2027-06-12', time: '14:00', venue: '' };
const party = { id: 'party', name: '', date: '2027-06-12', time: '19:00', venue: 'Lake House' };
const wedding = (subEvents, extra = {}, lang = 'en') => ({
  t: 'wedding',
  d: makeInviteData(getTemplate('wedding', lang), { title: 'Ana & Mihai', subEvents, ...extra }, lang),
});
const yes = (partySize) => ({ attending: true, partySize });
const no = { attending: false, partySize: 0 };
const ids = ['civil', 'church', 'party'];

test('a record keeps sub-event ids through edits and moves, and a sub-event without one takes its position', () => {
  const state = wedding([{ ...civil, id: undefined }, church]);
  assert.deepEqual(subEventIds(state.d), ['1', 'church']);
  assert.equal(addSubEvent(state), true);
  const added = state.d.subEvents[2].id;
  assert.match(added, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(moveSubEvent(state, 2, -1), true);
  assert.deepEqual(subEventIds(state.d), ['1', added, 'church']);
  // A repeated or malformed id gets a new id or the position.
  const repaired = subEventIds(makeInviteData(getTemplate('wedding'), { subEvents: [civil, civil, { id: 'a b' }] }));
  assert.deepEqual([repaired[0], repaired[2]], ['civil', '3']);
  assert.match(repaired[1], /^[A-Za-z0-9_-]{22}$/);
  assert.deepEqual(subEventLabels(wedding([civil, party]).d, 'ro'), [
    { id: 'civil', name: 'Civil ceremony' },
    { id: 'party', name: 'Momentul 2' },
  ]);
});

test('readPublished gives each sub-event an id and refuses a malformed or repeated one', () => {
  const { photoY, ...d } = wedding(undefined).d;
  const read = (subEvents) => readPublished({ t: 'wedding', d: { ...d, subEvents } })?.d.subEvents;
  const { id, ...unnamed } = civil;
  assert.deepEqual(read([unnamed, church]), [{ id: '1', ...unnamed }, church]);
  assert.equal(read([civil, { ...church, id: 'civil' }]), undefined);
  assert.equal(read([{ ...unnamed, id: '2' }, unnamed]), undefined);
  assert.equal(read([{ ...civil, id: 'x'.repeat(23) }]), undefined);
  assert.equal(read([{ ...civil, id: 7 }]), undefined);
});

test('makeReply with sub-events needs one valid answer for each and derives the reply answer', () => {
  const answers = { civil: no, church: yes(2), party: yes(4) };
  assert.deepEqual(makeReply({ name: ' Sam ', attending: false, partySize: 9, answers }, { subEventIds: ids }), {
    reply: { name: 'Sam', attending: true, partySize: 4, answers, note: '' },
    invalid: [],
  });
  assert.deepEqual(
    makeReply({ name: 'Sam', answers: { civil: no, church: no, party: no } }, { subEventIds: ids }).reply,
    { name: 'Sam', attending: false, partySize: 0, answers: { civil: no, church: no, party: no }, note: '' },
  );
  const refused = {
    'no answers': undefined,
    'a list': [no, no, no],
    'a missing sub-event': { civil: no, church: no },
    'an unknown sub-event': { ...answers, dinner: no },
    'an unchosen answer': { ...answers, civil: { attending: null, partySize: 0 } },
    'a declined answer with people': { ...answers, civil: { attending: false, partySize: 1 } },
    'too many people': { ...answers, party: yes(11) },
    'no people': { ...answers, party: yes(0) },
    'an extra field': { ...answers, civil: { ...no, meal: 1 } },
  };
  for (const [label, value] of Object.entries(refused)) {
    assert.deepEqual(
      makeReply({ name: 'Sam', answers: value }, { subEventIds: ids }),
      {
        reply: null,
        invalid: ['answers'],
      },
      label,
    );
  }
  assert.equal(
    makeReply({ name: 'Sam', answers: { ...answers, party: yes(20) } }, { partySizeLimit: 20, subEventIds: ids }).reply
      ?.partySize,
    20,
  );
  assert.deepEqual(makeReply({ name: 'Sam', attending: true, partySize: 1, answers }).reply, {
    name: 'Sam',
    attending: true,
    partySize: 1,
    note: '',
  });
});

test('the totals of each sub-event count yes, no, the people attending and replies without an answer', () => {
  const replies = [
    { answers: { civil: yes(2), church: no } },
    { answers: { civil: yes(3), church: yes(1) } },
    { attending: true, partySize: 5 },
  ];
  assert.deepEqual(subEventTally(['civil', 'church'], replies), [
    { id: 'civil', yes: 2, no: 0, attending: 5, unanswered: 1 },
    { id: 'church', yes: 1, no: 1, attending: 1, unanswered: 1 },
  ]);
});

const messages = {
  en: 'Enter a name of up to 80 characters, an answer, and a party size from 1 to 10 when attending. A note can have up to 300 characters. An invitation with parts needs an answer for each part. An invitation with a menu needs the number of people for each menu option, adding up to the party size.',
  ro: 'Introdu un nume de cel mult 80 de caractere, un răspuns și un număr de persoane între 1 și 10 dacă participi. Nota poate avea cel mult 300 de caractere. O invitație cu momente are nevoie de un răspuns pentru fiecare moment. O invitație cu meniu are nevoie de numărul de persoane pentru fiecare fel de meniu, cu un total egal cu numărul de persoane.',
};

for (const lang of ['en', 'ro']) {
  test(`in ${lang}, an open-mode reply answers each sub-event, and one that misses a sub-event is refused`, async () => {
    const { client } = await setup();
    const browser = client(newId(), lang);
    const guests = client(newId(), lang);
    const cred = host();
    await browser.publish(cred, wedding([civil, church], {}, lang));
    const reply = guest();
    const missing = await guests.saveReply(cred.id, reply, { name: 'Sam', answers: { civil: yes(2) } });
    assert.deepEqual([missing.status, missing.message], [400, messages[lang]]);
    const answers = { civil: yes(2), church: no };
    const sam = { name: 'Sam', attending: true, partySize: 2, answers, note: '' };
    assert.equal((await guests.saveReply(cred.id, reply, sam)).status, 201);
    assert.deepEqual((await guests.loadReply(cred.id, reply)).data, { ...sam, version: 1 });
    reply.version = 1;
    const changed = { ...sam, attending: true, partySize: 3, answers: { civil: yes(1), church: yes(3) } };
    assert.equal((await guests.saveReply(cred.id, reply, changed)).status, 200);
    const managed = (await browser.loadResponses(cred)).data;
    assert.deepEqual(
      managed.responses.map(({ name, attending, partySize, answers }) => ({ name, attending, partySize, answers })),
      [{ name: 'Sam', attending: true, partySize: 3, answers: changed.answers }],
    );
    const stale = await guests.saveReply(cred.id, { ...reply, version: 1 }, sam);
    assert.deepEqual([stale.status, stale.data.answers], [409, changed.answers]);
  });
}

test('a reply saved before the host added sub-events shows no answer to them until the guest answers', async () => {
  const { client } = await setup();
  const browser = client();
  const guests = client(newId());
  const cred = host();
  await browser.publish(cred, wedding(undefined));
  const reply = guest();
  await guests.saveReply(cred.id, reply, { name: 'Sam', attending: true, partySize: 2 });
  cred.version = 1;
  await browser.publish(cred, wedding([civil, church]));
  const managed = (await browser.loadResponses(cred)).data;
  assert.deepEqual(managed.responses[0].answers, undefined);
  assert.deepEqual(managed.totals, { responses: 1, yes: 1, no: 0, attending: 2 });
  assert.deepEqual(subEventTally(subEventIds(managed.d), managed.responses), [
    { id: 'civil', yes: 0, no: 0, attending: 0, unanswered: 1 },
    { id: 'church', yes: 0, no: 0, attending: 0, unanswered: 1 },
  ]);
  reply.version = 1;
  const unchanged = await guests.saveReply(cred.id, reply, { name: 'Sam', attending: true, partySize: 2 });
  assert.equal(unchanged.status, 400);
  const answers = { civil: yes(2), church: no };
  assert.equal((await guests.saveReply(cred.id, reply, { name: 'Sam', answers })).status, 200);
  assert.deepEqual((await guests.loadReply(cred.id, reply)).data.answers, answers);
});

test('an invitation stored before sub-events had ids takes answers keyed by position', async () => {
  const { client, db } = await setup();
  const browser = client();
  const cred = host();
  await browser.publish(cred, wedding([civil, church]));
  const { id: _civil, ...oldCivil } = civil;
  const { id: _church, ...oldChurch } = church;
  await db.query(`update events set d = jsonb_set(d, '{subEvents}', $2::text::jsonb) where id = $1`, [
    cred.id,
    JSON.stringify([oldCivil, oldChurch]),
  ]);
  const opened = await client(newId()).loadEvent(cred.id);
  const guestIds = subEventIds(makeInviteData(getTemplate('wedding'), opened.data.d));
  assert.deepEqual(guestIds, ['1', '2']);
  const answers = { 1: yes(2), 2: no };
  assert.equal((await client(newId()).saveReply(cred.id, guest(), { name: 'Sam', answers })).status, 201);
});

test('a guest-list party answers each sub-event through its personal link and the host edits the answers', async () => {
  const { client } = await setup();
  const tracker = client();
  const cred = host();
  await tracker.publish(cred, wedding([civil, church], { mode: 'guestList' }));
  const id = newId();
  await tracker.addParty(cred, id, { name: 'Familia Popescu', defaultSeats: 4 });
  const personal = { id, secret: await partyLinkSecret(cred.secret, id, 'personal'), version: undefined };
  const guests = client(newId(), 'ro');
  const missing = await guests.savePartyReply(cred.id, personal, { attending: true, partySize: 4 });
  assert.equal(missing.status, 400);
  const answers = { civil: yes(4), church: yes(12) };
  const saved = await guests.savePartyReply(cred.id, personal, { answers, note: '' });
  assert.equal(saved.status, 201);
  const loaded = (await guests.loadParty(cred.id, personal)).data.reply;
  assert.deepEqual(loaded, { attending: true, partySize: 12, answers, note: '', version: saved.data.version });
  const edited = { civil: no, church: yes(3) };
  const hostEdit = await tracker.saveHostPartyReply(cred, id, { answers: edited, note: '', version: loaded.version });
  assert.equal(hostEdit.status, 200);
  const listed = (await tracker.loadResponses(cred)).data.parties[0].reply;
  assert.deepEqual([listed.answers, listed.partySize], [edited, 3]);
  const seats = await tracker.setPartySeats(cred, id, { partySize: 2, version: hostEdit.data.version });
  assert.deepEqual([seats.status, seats.message], [400, 'Use Edit reply to change the people at each part.']);
});

test('the replies CSV and the guest-list CSV add a column pair for each sub-event and a totals row in English and Romanian', () => {
  const labels = subEventLabels(wedding([civil, party]).d, 'en');
  const at = '2027-01-02T10:00:00.000Z';
  const replies = [
    {
      name: 'Sam',
      attending: true,
      partySize: 2,
      answers: { civil: yes(2), party: no },
      note: '',
      createdAt: at,
      updatedAt: at,
    },
    { name: 'Ana', attending: false, partySize: 0, note: '', createdAt: at, updatedAt: at },
  ];
  const lines = (text) => text.slice(1).split('\r\n');
  // The reply times depend on the runtime's time zone, so the comparison stops before them.
  assert.deepEqual(
    lines(repliesCsv(replies, 'en', labels))
      .slice(0, 4)
      .map((line) => line.split(',').slice(0, 8)),
    [
      [
        'Name',
        'Attending',
        'Party size',
        'Civil ceremony: attending',
        'Civil ceremony: people',
        'Part 2: attending',
        'Part 2: people',
        'Note',
      ],
      ['Sam', 'Yes', '2', 'Yes', '2', 'No', '0', ''],
      ['Ana', 'No', '0', '', '', '', '', ''],
      ['Total', '', '', '1', '2', '0', '0', ''],
    ],
  );
  const roLabels = subEventLabels(wedding([civil, party]).d, 'ro');
  const parties = [
    {
      name: 'Familia Popescu',
      defaultSeats: 4,
      reply: { attending: true, partySize: 3, answers: { civil: no, party: yes(3) }, note: 'Fără nuci' },
    },
    { name: 'Ion', defaultSeats: 1, reply: null },
  ];
  assert.deepEqual(lines(guestListCsv(parties, 'ro', roLabels)).slice(0, 4), [
    'Nume;Stare;Locuri;Participă;Civil ceremony: participă;Civil ceremony: persoane;Momentul 2: participă;Momentul 2: persoane;Notă',
    'Familia Popescu;A răspuns;3;Da;Nu;0;Da;3;Fără nuci',
    'Ion;Fără răspuns;1;;;;;;',
    'Total;;;;0;0;1;3;',
  ]);
});
