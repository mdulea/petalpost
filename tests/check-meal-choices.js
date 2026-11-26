// Fails when the meal counts of a reply break. Checks: the editor actions on menu options, which keep each option's
// id, stop at 6 and leave a record without options unchanged; readPublished, which refuses a malformed menu;
// makeReply with menu options, which needs a whole count for each option that adds up to the party size, gives a
// declining reply no counts and ignores counts without options; the meal totals; open-mode replies through the API
// in English and Romanian, with the counts in the reply edit link and management reads and refused counts that do
// not add up; personal-link and host replies of a guest-list party, the seat editor with meal counts, and a reply
// form with sub-events and meal counts; the replies CSV and the guest-list CSV with a meal column for each option and
// the meal totals in English and Romanian.
// Each API test uses fresh random ids and client IPs in the shared migrated in-memory PGlite database of
// tests/api-setup.js.
// Run: pnpm exec node tests/check-meal-choices.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { guestListCsv, repliesCsv } from '../public/js/csv.js';
import {
  addMenuOption,
  makeInviteData,
  MAX_MENU_OPTIONS,
  menuLabels,
  menuOptionIds,
  readPublished,
  removeMenuOption,
  renameMenuOption,
  resetInvite,
  subEventLabels,
} from '../public/js/invite.js';
import { makeReply, mealTally, newId, partyLinkSecret } from '../public/js/rsvp.js';
import { getTemplate } from '../public/js/templates.js';
import { guest, host, setup } from './api-setup.js';

const standard = { id: 'standard', name: 'Standard' };
const vegetarian = { id: 'veg', name: 'Vegetarian' };
const child = { id: 'child', name: '' };
const menuIds = ['standard', 'veg', 'child'];
const wedding = (menu, extra = {}, lang = 'en') => ({
  t: 'wedding',
  d: makeInviteData(getTemplate('wedding', lang), { title: 'Ana & Mihai', menu, ...extra }, lang),
});
const meals = (s, v, c) => ({ standard: s, veg: v, child: c });

test('the editor adds, renames and removes menu options, keeps their ids and stops at 6', () => {
  const state = wedding(undefined);
  assert.equal(Object.hasOwn(state.d, 'menu'), false);
  assert.equal(addMenuOption(state), true);
  const [first] = menuOptionIds(state.d);
  assert.match(first, /^[A-Za-z0-9_-]{22}$/);
  assert.equal(renameMenuOption(state, 0, 'Vegetarian'.repeat(5)), true);
  assert.deepEqual(state.d.menu, [{ id: first, name: 'Vegetarian'.repeat(4) }]);
  while (addMenuOption(state));
  assert.equal(state.d.menu.length, MAX_MENU_OPTIONS);
  assert.equal(renameMenuOption(state, MAX_MENU_OPTIONS, 'Fish'), false);
  assert.equal(removeMenuOption(state, 0), true);
  assert.equal(menuOptionIds(state.d).includes(first), false);
  resetInvite(state);
  assert.equal(Object.hasOwn(state.d, 'menu'), false);
  // A repeated or malformed id gets a new one.
  const repaired = menuOptionIds(makeInviteData(getTemplate('wedding'), { menu: [standard, standard, { id: 'a b' }] }));
  assert.equal(repaired[0], 'standard');
  assert.equal(new Set(repaired).size, 3);
  assert.deepEqual(menuLabels(wedding([standard, child]).d, 'ro'), [
    { id: 'standard', name: 'Standard' },
    { id: 'child', name: 'Opțiunea 2' },
  ]);
});

test('readPublished keeps a valid menu, drops an empty one and refuses a malformed one', () => {
  const { photoY, ...d } = wedding(undefined).d;
  const read = (menu) => readPublished({ t: 'wedding', d: { ...d, menu } });
  assert.deepEqual(read([standard, child])?.d.menu, [standard, child]);
  assert.equal(Object.hasOwn(read([]).d, 'menu'), false);
  const refused = {
    'seven options': Array.from({ length: 7 }, (_, i) => ({ id: `o${i}`, name: '' })),
    'a repeated id': [standard, { ...vegetarian, id: 'standard' }],
    'a missing id': [{ name: 'Fish' }],
    'a malformed id': [{ id: 'a b', name: 'Fish' }],
    'a long name': [{ id: 'fish', name: 'x'.repeat(41) }],
    'an extra field': [{ ...standard, price: 1 }],
    'an object': { standard },
  };
  for (const [label, menu] of Object.entries(refused)) assert.equal(read(menu), null, label);
});

test('makeReply with menu options needs a whole count for each that adds up to the party size', () => {
  const options = { menuIds };
  assert.deepEqual(makeReply({ name: 'Sam', attending: true, partySize: 3, meals: meals(2, 0, 1) }, options), {
    reply: { name: 'Sam', attending: true, partySize: 3, meals: meals(2, 0, 1), note: '' },
    invalid: [],
  });
  const refused = {
    'no counts': undefined,
    'a list': [2, 0, 1],
    'a smaller sum': meals(1, 0, 1),
    'a larger sum': meals(2, 1, 1),
    'a missing option': { standard: 2, veg: 1 },
    'an unknown option': { ...meals(2, 0, 1), fish: 0 },
    'a negative count': meals(4, -1, 0),
    'a fraction': meals(2.5, 0.5, 0),
    'an empty input': meals(3, Number.NaN, 0),
  };
  for (const [label, value] of Object.entries(refused)) {
    assert.deepEqual(
      makeReply({ name: 'Sam', attending: true, partySize: 3, meals: value }, options),
      { reply: null, invalid: ['meals'] },
      label,
    );
  }
  // An invalid party size is reported alone, because the counts have nothing to add up to.
  assert.deepEqual(makeReply({ name: 'Sam', attending: true, partySize: 0, meals: meals(0, 0, 0) }, options).invalid, [
    'partySize',
  ]);
  assert.deepEqual(makeReply({ name: 'Sam', attending: false, partySize: 0, meals: meals(1, 0, 0) }, options).reply, {
    name: 'Sam',
    attending: false,
    partySize: 0,
    note: '',
  });
  assert.deepEqual(makeReply({ name: 'Sam', attending: true, partySize: 2, meals: meals(1, 1, 0) }).reply, {
    name: 'Sam',
    attending: true,
    partySize: 2,
    note: '',
  });
  // With sub-events, the counts add up to the largest party size among the answers.
  const answers = { civil: { attending: true, partySize: 2 }, party: { attending: true, partySize: 4 } };
  const bySubEvent = { menuIds, subEventIds: ['civil', 'party'] };
  assert.equal(makeReply({ name: 'Sam', answers, meals: meals(2, 2, 0) }, bySubEvent).reply?.partySize, 4);
  assert.deepEqual(makeReply({ name: 'Sam', answers, meals: meals(1, 1, 0) }, bySubEvent).invalid, ['meals']);
});

test('the meal totals sum each option over the attending replies and count those without meals', () => {
  const replies = [
    { attending: true, partySize: 3, meals: { standard: 2, veg: 1 } },
    { attending: true, partySize: 1, meals: { standard: 1, veg: 0, child: 0 } },
    { attending: true, partySize: 2 },
    { attending: false, partySize: 0 },
  ];
  assert.deepEqual(mealTally(menuIds, replies), {
    options: [
      { id: 'standard', count: 3 },
      { id: 'veg', count: 1 },
      { id: 'child', count: 0 },
    ],
    missing: 1,
  });
});

const messages = {
  en: 'Enter a name of up to 80 characters, an answer, and a party size from 1 to 10 when attending. A note can have up to 300 characters. An invitation with parts needs an answer for each part. An invitation with a menu needs the number of people for each menu option, adding up to the party size.',
  ro: 'Introdu un nume de cel mult 80 de caractere, un răspuns și un număr de persoane între 1 și 10 dacă participi. Nota poate avea cel mult 300 de caractere. O invitație cu momente are nevoie de un răspuns pentru fiecare moment. O invitație cu meniu are nevoie de numărul de persoane pentru fiecare fel de meniu, cu un total egal cu numărul de persoane.',
};

for (const lang of ['en', 'ro']) {
  test(`in ${lang}, an open-mode reply gives meal counts, and counts that do not add up are refused`, async () => {
    const { client } = await setup();
    const browser = client(newId(), lang);
    const guests = client(newId(), lang);
    const cred = host();
    await browser.publish(cred, wedding([standard, vegetarian, child], {}, lang));
    const reply = guest();
    const short = await guests.saveReply(cred.id, reply, {
      name: 'Sam',
      attending: true,
      partySize: 3,
      meals: meals(1, 1, 0),
    });
    assert.deepEqual([short.status, short.message], [400, messages[lang]]);
    const sam = { name: 'Sam', attending: true, partySize: 3, meals: meals(1, 1, 1), note: 'Fără nuci' };
    assert.equal((await guests.saveReply(cred.id, reply, sam)).status, 201);
    assert.deepEqual((await guests.loadReply(cred.id, reply)).data, { ...sam, version: 1 });
    const declined = guest();
    const ana = { name: 'Ana', attending: false, partySize: 0, meals: meals(1, 0, 0), note: '' };
    assert.equal((await guests.saveReply(cred.id, declined, ana)).status, 201);
    const managed = (await browser.loadResponses(cred)).data;
    assert.deepEqual(
      managed.responses.map(({ name, meals }) => ({ name, meals })),
      [
        { name: 'Sam', meals: meals(1, 1, 1) },
        { name: 'Ana', meals: undefined },
      ],
    );
    reply.version = 1;
    const changed = { ...sam, partySize: 2, meals: meals(0, 2, 0) };
    assert.equal((await guests.saveReply(cred.id, reply, changed)).status, 200);
    const stale = await guests.saveReply(cred.id, { ...reply, version: 1 }, sam);
    assert.deepEqual([stale.status, stale.data.meals], [409, changed.meals]);
  });
}

test('an invitation without menu options takes and returns replies without meal counts', async () => {
  const { client } = await setup();
  const browser = client();
  const cred = host();
  await browser.publish(cred, wedding(undefined));
  const reply = guest();
  const sam = { name: 'Sam', attending: true, partySize: 2, note: '' };
  assert.equal((await client(newId()).saveReply(cred.id, reply, { ...sam, meals: { x: 2 } })).status, 201);
  assert.deepEqual((await client(newId()).loadReply(cred.id, reply)).data, { ...sam, version: 1 });
  assert.equal(Object.hasOwn((await browser.loadResponses(cred)).data.responses[0], 'meals'), false);
});

test('a guest-list party gives meal counts through its personal link, and the host changes them with the seats', async () => {
  const { client } = await setup();
  const tracker = client();
  const cred = host();
  await tracker.publish(cred, wedding([standard, vegetarian], { mode: 'guestList' }));
  const id = newId();
  await tracker.addParty(cred, id, { name: 'Familia Popescu', defaultSeats: 4 });
  const personal = { id, secret: await partyLinkSecret(cred.secret, id, 'personal'), version: undefined };
  const guests = client(newId(), 'ro');
  const missing = await guests.savePartyReply(cred.id, personal, { attending: true, partySize: 4, note: '' });
  assert.equal(missing.status, 400);
  const counts = { standard: 3, veg: 1 };
  const saved = await guests.savePartyReply(cred.id, personal, { attending: true, partySize: 4, meals: counts });
  assert.equal(saved.status, 201);
  const loaded = (await guests.loadParty(cred.id, personal)).data.reply;
  assert.deepEqual(loaded, { attending: true, partySize: 4, meals: counts, note: '', version: saved.data.version });
  const unbalanced = await tracker.setPartySeats(cred, id, { partySize: 5, meals: counts, version: loaded.version });
  assert.deepEqual(
    [unbalanced.status, unbalanced.message],
    [400, 'Enter the number of people for each menu option, adding up to the seats.'],
  );
  const seats = await tracker.setPartySeats(cred, id, {
    partySize: 5,
    meals: { standard: 3, veg: 2 },
    version: loaded.version,
  });
  assert.equal(seats.status, 200);
  const listed = (await tracker.loadResponses(cred)).data.parties[0].reply;
  assert.deepEqual([listed.partySize, listed.meals], [5, { standard: 3, veg: 2 }]);
  const none = await tracker.setPartySeats(cred, id, { partySize: 0, version: seats.data.version });
  assert.equal(none.status, 200);
  const declined = (await tracker.loadResponses(cred)).data.parties[0].reply;
  assert.deepEqual([declined.attending, declined.meals], [false, undefined]);
});

test('the host changes the meal counts of a reply with sub-events through the reply form', async () => {
  const { client } = await setup();
  const tracker = client();
  const cred = host();
  const civil = { id: 'civil', name: 'Civil', date: '2027-06-12', time: '11:00', venue: '' };
  await tracker.publish(cred, wedding([standard, vegetarian], { mode: 'guestList', subEvents: [civil] }));
  const id = newId();
  await tracker.addParty(cred, id, { name: 'Familia Radu', defaultSeats: 2 });
  const answers = { civil: { attending: true, partySize: 2 } };
  const wrong = await tracker.saveHostPartyReply(cred, id, { answers, meals: { standard: 1, veg: 0 }, note: '' });
  assert.equal(wrong.status, 400);
  const saved = await tracker.saveHostPartyReply(cred, id, { answers, meals: { standard: 1, veg: 1 }, note: '' });
  assert.equal(saved.status, 201);
  const listed = (await tracker.loadResponses(cred)).data.parties[0].reply;
  assert.deepEqual([listed.partySize, listed.meals], [2, { standard: 1, veg: 1 }]);
});

test('the replies CSV and the guest-list CSV add a meal column for each option and the meal totals', () => {
  const menu = menuLabels(wedding([standard, child]).d, 'en');
  const at = '2027-01-02T10:00:00.000Z';
  const replies = [
    {
      name: 'Sam',
      attending: true,
      partySize: 3,
      meals: { standard: 2, child: 1 },
      note: '',
      createdAt: at,
      updatedAt: at,
    },
    { name: 'Ana', attending: false, partySize: 0, note: '', createdAt: at, updatedAt: at },
  ];
  const lines = (text) => text.slice(1).split('\r\n');
  // The reply times depend on the runtime's time zone, so the comparison stops before them.
  assert.deepEqual(
    lines(repliesCsv(replies, 'en', [], menu))
      .slice(0, 4)
      .map((line) => line.split(',').slice(0, 6)),
    [
      ['Name', 'Attending', 'Party size', 'Standard: meals', 'Option 2: meals', 'Note'],
      ['Sam', 'Yes', '3', '2', '1', ''],
      ['Ana', 'No', '0', '', '', ''],
      ['Total', '', '', '2', '1', ''],
    ],
  );
  const civil = { id: 'civil', name: 'Civil', date: '', time: '', venue: '' };
  const d = wedding([standard, child], { subEvents: [civil] }, 'ro').d;
  const parties = [
    {
      name: 'Familia Popescu',
      defaultSeats: 4,
      reply: {
        attending: true,
        partySize: 3,
        answers: { civil: { attending: true, partySize: 3 } },
        meals: { standard: 1, child: 2 },
        note: 'Fără nuci',
      },
    },
    { name: 'Ion', defaultSeats: 1, reply: null },
  ];
  assert.deepEqual(lines(guestListCsv(parties, 'ro', subEventLabels(d, 'ro'), menuLabels(d, 'ro'))).slice(0, 4), [
    'Nume;Stare;Locuri;Participă;Civil: participă;Civil: persoane;Standard: meniuri;Opțiunea 2: meniuri;Notă',
    'Familia Popescu;A răspuns;3;Da;Da;3;1;2;Fără nuci',
    'Ion;Fără răspuns;1;;;;;;',
    'Total;;;;1;3;1;2;',
  ]);
});
