// Fails when pure sub-event and menu-option reply formatters break. Checks: answerLine with yes, no and missing
// answers in English and Romanian; answerLines over labels; answerTotalLines; mealLine with counts, missing counts,
// declined replies and empty menus; mealTotalLines with option counts and missing counts.
// Run: pnpm exec node tests/check-reply-format.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { answerLine, answerLines, answerTotalLines, mealLine, mealTotalLines } from '../public/js/reply-format.js';

const labels = [
  { id: 'civil', name: 'Civil' },
  { id: 'dinner', name: 'Dinner' },
];
const menu = [
  { id: 'std', name: 'Standard' },
  { id: 'veg', name: 'Vegetarian' },
];

test('answerLine and answerLines format yes, no and missing answers in English and Romanian', () => {
  assert.equal(answerLine('Civil', { attending: true, partySize: 2 }, 'en'), 'Civil: Yes, 2 people');
  assert.equal(answerLine('Civil', { attending: false, partySize: 0 }, 'en'), 'Civil: No');
  assert.equal(answerLine('Civil', null, 'en'), 'Civil: No answer');
  assert.equal(answerLine('Civil', { attending: true, partySize: 2 }, 'ro'), 'Civil: Da, 2 persoane');
  assert.equal(answerLine('Civil', { attending: false, partySize: 0 }, 'ro'), 'Civil: Nu');
  assert.equal(answerLine('Civil', null, 'ro'), 'Civil: Fără răspuns');
  assert.deepEqual(answerLines(labels, { answers: { civil: { attending: true, partySize: 3 } } }, 'en'), [
    'Civil: Yes, 3 people',
    'Dinner: No answer',
  ]);
});

test('answerTotalLines formats sub-event totals in English and Romanian', () => {
  const tallies = [
    { id: 'civil', yes: 2, no: 1, attending: 5, unanswered: 0 },
    { id: 'dinner', yes: 1, no: 0, attending: 2, unanswered: 1, pending: 2 },
  ];
  assert.deepEqual(answerTotalLines(labels, tallies, 'en'), [
    'Civil: 5 people attending, 2 yes, 1 no',
    'Dinner: 2 people attending, 1 yes, 0 no, 1 without an answer, 2 parties without a reply',
  ]);
  assert.deepEqual(answerTotalLines(labels, tallies, 'ro'), [
    'Civil: 5 persoane confirmate, 2 da, 1 nu',
    'Dinner: 2 persoane confirmate, 1 da, 0 nu, 1 fără răspuns, 2 grupuri care nu au răspuns',
  ]);
});

test('mealLine formats meal counts, missing counts and returns null when declined or without menu', () => {
  assert.equal(mealLine([], { attending: true, meals: { std: 2 } }, 'en'), null);
  assert.equal(mealLine(menu, { attending: false, partySize: 0 }, 'en'), null);
  assert.equal(mealLine(menu, null, 'en'), null);
  assert.equal(mealLine(menu, { attending: true, partySize: 2 }, 'en'), 'Menu: not given');
  assert.equal(mealLine(menu, { attending: true, partySize: 2 }, 'ro'), 'Meniu: nespecificat');
  assert.equal(
    mealLine(menu, { attending: true, partySize: 3, meals: { std: 2, veg: 1 } }, 'en'),
    'Menu: 2 Standard, 1 Vegetarian',
  );
  assert.equal(
    mealLine(menu, { attending: true, partySize: 2, meals: { std: 2 } }, 'ro'),
    'Meniu: 2 Standard, 0 Vegetarian',
  );
});

test('mealTotalLines sums option counts and includes attending replies without meal counts', () => {
  assert.deepEqual(mealTotalLines([], [{ attending: true, meals: { std: 2 } }], 'en'), []);
  const replies = [
    { attending: true, partySize: 3, meals: { std: 2, veg: 1 } },
    { attending: true, partySize: 2 },
    { attending: false, partySize: 0 },
  ];
  assert.deepEqual(mealTotalLines(menu, replies, 'en'), [
    'Standard: 2 meals',
    'Vegetarian: 1 meal',
    '1 attending reply without menu counts',
  ]);
  assert.deepEqual(mealTotalLines(menu, replies, 'ro'), [
    'Standard: 2 meniuri',
    'Vegetarian: un meniu',
    'un răspuns cu participare fără meniu',
  ]);
});
