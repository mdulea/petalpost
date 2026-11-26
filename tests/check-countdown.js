// Fails when the event countdown breaks. Checks: the start of an event with and without a time in local time; days
// counted in calendar days, including across a daylight saving change; hours, rounded up, on the event's day and in
// the last 24 hours, including a 23-hour and a 25-hour day; nothing without a date or once the event starts; the
// English and Romanian countdown text with Romanian plural forms.
// The checks run in the Europe/Bucharest time zone, which changes to summer time on 29 March 2026 at 03:00 and back
// on 25 October 2026 at 04:00.
// Run: pnpm exec node tests/check-countdown.js
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.TZ = 'Europe/Bucharest';
const { countdown, eventStart } = await import('../public/js/countdown.js');
const { UI } = await import('../public/js/i18n.js');

const left = (date, time, now) => countdown(eventStart({ date, time }), new Date(now));

test('an event starts at its local date and time, or at noon without a time', () => {
  assert.equal(eventStart({ date: '2026-12-12', time: '14:00' }).toISOString(), '2026-12-12T12:00:00.000Z');
  assert.equal(eventStart({ date: '2026-07-12', time: '' }).toISOString(), '2026-07-12T09:00:00.000Z');
});

test('an invite without a date has no countdown', () => {
  assert.equal(eventStart({ date: '', time: '14:00' }), null);
  assert.equal(countdown(null, new Date()), null);
});

test('the countdown counts calendar days before the event day', () => {
  assert.deepEqual(left('2026-12-12', '14:00', '2026-12-01T08:00:00Z'), { unit: 'days', count: 11 });
  // 25 hours before an evening event, the event is tomorrow.
  assert.deepEqual(left('2026-12-12', '21:00', '2026-12-11T18:00:00Z'), { unit: 'days', count: 1 });
});

test('the day count follows the local date, not UTC', () => {
  // 23:30 UTC on 11 December is 01:30 on 12 December in Bucharest, the event's day.
  assert.deepEqual(left('2026-12-12', '14:00', '2026-12-11T23:30:00Z'), { unit: 'hours', count: 13 });
  // 21:30 UTC on 30 November is 23:30 on 30 November in Bucharest, 12 days before 12 December.
  assert.deepEqual(left('2026-12-12', '14:00', '2026-11-30T21:30:00Z'), { unit: 'days', count: 12 });
});

test('the day count stays in calendar days across the change to summer time', () => {
  // 20:00 on 28 March to 19:00 on 30 March is 46 hours, two calendar days.
  assert.deepEqual(left('2026-03-30', '19:00', '2026-03-28T18:00:00Z'), { unit: 'days', count: 2 });
});

test('the last day counts hours, rounded up', () => {
  assert.deepEqual(left('2026-12-12', '14:00', '2026-12-12T11:30:00Z'), { unit: 'hours', count: 1 });
  // 23 hours before the event, on the day before it.
  assert.deepEqual(left('2026-12-12', '14:00', '2026-12-11T13:00:00Z'), { unit: 'hours', count: 23 });
});

test('the hour count follows the 23-hour day of the change to summer time', () => {
  // Midnight to noon on 29 March 2026 is 11 hours, because 03:00 becomes 04:00.
  assert.deepEqual(left('2026-03-29', '12:00', '2026-03-28T22:00:00Z'), { unit: 'hours', count: 11 });
});

test('the hour count follows the 25-hour day of the change back to winter time', () => {
  // 00:30 to 23:45 on 25 October 2026 is 24 hours and 15 minutes, because 04:00 becomes 03:00.
  assert.deepEqual(left('2026-10-25', '23:45', '2026-10-24T21:30:00Z'), { unit: 'hours', count: 25 });
});

test('the countdown ends when the event starts', () => {
  assert.deepEqual(left('2026-12-12', '14:00', '2026-12-12T11:59:00Z'), { unit: 'hours', count: 1 });
  assert.equal(left('2026-12-12', '14:00', '2026-12-12T12:00:00Z'), null);
  assert.equal(left('2026-12-12', '14:00', '2026-12-13T12:00:00Z'), null);
});

test('the countdown text is English', () => {
  const text = UI.en.guest.countdown;
  assert.equal(text({ unit: 'days', count: 1 }), 'Starts in 1 day');
  assert.equal(text({ unit: 'days', count: 12 }), 'Starts in 12 days');
  assert.equal(text({ unit: 'hours', count: 1 }), 'Starts in 1 hour');
  assert.equal(text({ unit: 'hours', count: 5 }), 'Starts in 5 hours');
});

test('the countdown text is Romanian, with "de" before 20 and later counts in the plural category other', () => {
  const text = UI.ro.guest.countdown;
  assert.equal(text({ unit: 'days', count: 1 }), 'Începe peste o zi');
  assert.equal(text({ unit: 'days', count: 19 }), 'Începe peste 19 zile');
  assert.equal(text({ unit: 'days', count: 20 }), 'Începe peste 20 de zile');
  assert.equal(text({ unit: 'days', count: 101 }), 'Începe peste 101 zile');
  assert.equal(text({ unit: 'hours', count: 1 }), 'Începe peste o oră');
  assert.equal(text({ unit: 'hours', count: 5 }), 'Începe peste 5 ore');
  assert.equal(text({ unit: 'hours', count: 24 }), 'Începe peste 24 de ore');
});
