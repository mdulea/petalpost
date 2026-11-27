// Fails when the event countdown or RSVP deadline checks break. Checks: the start of an event with and without a time
// in local time; days counted in calendar days, including across a daylight saving change; hours, rounded up, on the
// event's day and in the last 24 hours, including a 23-hour and a 25-hour day; nothing without a date or once the event
// starts; the English and Romanian countdown text with Romanian plural forms; RSVP deadline date validation and
// Europe/Bucharest midnight checks across winter and summer time; the last minute of the RSVP deadline and the start of
// the deletion at 23:59 Europe/Bucharest time in winter and summer, whatever the runtime's time zone; the tracker's
// deadline countdown until the deadline passes, and its nudge in the last 7 days while a party has not replied; the
// deletion countdown, counted from the latest sub-event date when there is one, and its nudge in the last 3 days and
// until the retention run deletes the list; the English and Romanian countdown and nudge text.
// The checks run in the Europe/Bucharest time zone, which changes to summer time on 29 March 2026 at 03:00 and back
// on 25 October 2026 at 04:00.
// Run: pnpm exec node tests/check-countdown.js
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.TZ = 'Europe/Bucharest';
const { bucharestDate, countdown, deadlineEnd, deletionStart, eventStart, isDeadlinePassed, isValidDate, trackerDue } =
  await import('../public/js/countdown.js');
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

test('isValidDate accepts real YYYY-MM-DD dates and rejects impossible or malformed dates', () => {
  assert.equal(isValidDate('2026-06-15'), true);
  assert.equal(isValidDate('2024-02-29'), true);
  for (const bad of ['', null, undefined, '2026-02-29', '2026-13-01', '2026-06-15T23:59', '15-06-2026']) {
    assert.equal(isValidDate(bad), false);
  }
});

test('the RSVP deadline closes after 23:59 Europe/Bucharest time in winter and summer', () => {
  assert.equal(isDeadlinePassed(null, new Date('2026-06-16T00:00:00Z')), false);
  assert.equal(isDeadlinePassed('', new Date('2026-06-16T00:00:00Z')), false);
  // Summer (EEST, UTC+3): 20:59:59Z is 23:59:59 on 15 June; 21:00:00Z is 00:00:00 on 16 June.
  assert.equal(bucharestDate(new Date('2026-06-15T20:59:59Z')), '2026-06-15');
  assert.equal(bucharestDate(new Date('2026-06-15T21:00:00Z')), '2026-06-16');
  assert.equal(isDeadlinePassed('2026-06-15', new Date('2026-06-15T20:59:59Z')), false);
  assert.equal(isDeadlinePassed('2026-06-15', new Date('2026-06-15T21:00:00Z')), true);
  // Winter (EET, UTC+2): 21:59:59Z is 23:59:59 on 15 January; 22:00:00Z is 00:00:00 on 16 January.
  assert.equal(bucharestDate(new Date('2026-01-15T21:59:59Z')), '2026-01-15');
  assert.equal(bucharestDate(new Date('2026-01-15T22:00:00Z')), '2026-01-16');
  assert.equal(isDeadlinePassed('2026-01-15', new Date('2026-01-15T21:59:59Z')), false);
  assert.equal(isDeadlinePassed('2026-01-15', new Date('2026-01-15T22:00:00Z')), true);
});

test('the deadline ends and the deletion starts at 23:59 Europe/Bucharest time in winter and summer', () => {
  assert.equal(deadlineEnd('2026-06-15').toISOString(), '2026-06-15T20:59:00.000Z');
  assert.equal(deadlineEnd('2026-01-15').toISOString(), '2026-01-15T21:59:00.000Z');
  // The deletion starts on the day after the event, here the first day of summer time and of winter time.
  assert.equal(deletionStart('2026-03-28').toISOString(), '2026-03-29T20:59:00.000Z');
  assert.equal(deletionStart('2026-10-24').toISOString(), '2026-10-25T21:59:00.000Z');
  assert.equal(deletionStart('2026-12-31').toISOString(), '2027-01-01T21:59:00.000Z');
  for (const bad of [undefined, '', '2026-02-30']) {
    assert.equal(deadlineEnd(bad), null);
    assert.equal(deletionStart(bad), null);
  }
});

test('the deadline and deletion moments do not depend on the runtime time zone', async () => {
  const { execFileSync } = await import('node:child_process');
  const script = `const c = await import(${JSON.stringify(new URL('../public/js/countdown.js', import.meta.url).href)});
    console.log(c.deadlineEnd('2026-06-15').toISOString(), c.deletionStart('2026-01-15').toISOString());`;
  for (const TZ of ['America/Los_Angeles', 'Asia/Tokyo', 'UTC']) {
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
      env: { ...process.env, TZ },
      encoding: 'utf8',
    });
    assert.equal(output.trim(), '2026-06-15T20:59:00.000Z 2026-01-16T21:59:00.000Z', TZ);
  }
});

const due = (d, pending, now) => trackerDue(d, pending, new Date(now));

test('the tracker counts down to the deadline until it passes', () => {
  const d = { date: '2026-12-20', deadline: '2026-12-10' };
  assert.deepEqual(due(d, 0, '2026-11-26T10:00:00Z').deadline, { left: { unit: 'days', count: 14 }, nudge: false });
  // 23:00 on the deadline day leaves 59 minutes, shown as 1 hour.
  assert.deepEqual(due(d, 0, '2026-12-10T21:00:00Z').deadline, { left: { unit: 'hours', count: 1 }, nudge: false });
  assert.equal(due(d, 0, '2026-12-10T21:59:00Z').deadline, null);
  assert.equal(due({ date: '2026-12-20' }, 3, '2026-11-26T10:00:00Z').deadline, null);
});

test('the deadline nudge shows in the last 7 days while a party has not replied', () => {
  const d = { date: '2026-12-20', deadline: '2026-12-10' };
  assert.equal(due(d, 12, '2026-12-02T10:00:00Z').deadline.nudge, false);
  assert.deepEqual(due(d, 12, '2026-12-03T10:00:00Z').deadline, { left: { unit: 'days', count: 7 }, nudge: true });
  assert.deepEqual(due(d, 1, '2026-12-10T10:00:00Z').deadline, { left: { unit: 'hours', count: 12 }, nudge: true });
  assert.equal(due(d, 0, '2026-12-07T10:00:00Z').deadline.nudge, false);
});

test('the tracker counts down to the deletion and nudges in the last 3 days', () => {
  const d = { date: '2026-12-20' };
  assert.deepEqual(due(d, 0, '2026-11-26T10:00:00Z').deletion, { left: { unit: 'days', count: 25 }, nudge: false });
  assert.equal(due(d, 0, '2026-12-17T10:00:00Z').deletion.nudge, false);
  assert.deepEqual(due(d, 0, '2026-12-18T10:00:00Z').deletion, { left: { unit: 'days', count: 3 }, nudge: true });
  assert.deepEqual(due(d, 5, '2026-12-21T21:00:00Z').deletion, { left: { unit: 'hours', count: 1 }, nudge: true });
  assert.equal(due({ date: '' }, 0, '2026-11-26T10:00:00Z').deletion, null);
});

test('the deletion countdown counts from the latest sub-event date', () => {
  const d = { date: '2026-12-01', subEvents: [{ date: '2026-12-20' }, { date: '' }, { date: '2026-12-05' }] };
  assert.deepEqual(due(d, 0, '2026-11-26T10:00:00Z').deletion, { left: { unit: 'days', count: 25 }, nudge: false });
});

test('after 23:59 on the day after the event, the deletion nudge stays until the retention run deletes the list', () => {
  assert.deepEqual(due({ date: '2026-12-20' }, 0, '2026-12-21T21:59:00Z').deletion, { left: null, nudge: true });
  assert.deepEqual(due({ date: '2026-12-20' }, 0, '2026-12-22T15:00:00Z').deletion, { left: null, nudge: true });
});

test('the countdown and nudge text is English', () => {
  const words = UI.en.countdowns;
  assert.equal(words.deadline({ unit: 'days', count: 1 }), 'Replies close in 1 day.');
  assert.equal(words.deadline({ unit: 'hours', count: 5 }), 'Replies close in 5 hours.');
  assert.equal(words.pending(1), '1 party has not replied.');
  assert.equal(words.pending(12), '12 parties have not replied.');
  assert.equal(words.deletion({ unit: 'days', count: 2 }), 'The guest list and its replies are deleted in 2 days.');
  assert.equal(words.deletionDue, 'The guest list and its replies are deleted within a day.');
  assert.equal(words.download, 'Download the guest-list CSV to keep a copy.');
});

test('the countdown and nudge text is Romanian, with "de" from 20', () => {
  const words = UI.ro.countdowns;
  assert.equal(words.deadline({ unit: 'days', count: 1 }), 'Confirmările se închid peste o zi.');
  assert.equal(words.deadline({ unit: 'hours', count: 5 }), 'Confirmările se închid peste 5 ore.');
  assert.equal(words.pending(1), 'Încă nu a răspuns un grup.');
  assert.equal(words.pending(12), 'Încă nu au răspuns 12 grupuri.');
  assert.equal(words.pending(20), 'Încă nu au răspuns 20 de grupuri.');
  assert.equal(
    words.deletion({ unit: 'days', count: 2 }),
    'Lista de invitați și răspunsurile ei se șterg peste 2 zile.',
  );
  assert.equal(words.deletionDue, 'Lista de invitați și răspunsurile ei se șterg în cel mult o zi.');
  assert.equal(words.download, 'Descarcă lista de invitați în format CSV ca să păstrezi o copie.');
});
