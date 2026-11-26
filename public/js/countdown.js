// The time left before an event. No DOM access, so tests/check-countdown.js runs it in Node.
// Event dates and times are floating local time: they read the same wall-clock time in every time zone, so the
// countdown and the calendar file use the time zone of the browser that shows them.

// The start time of an event without a time.
export const DEFAULT_TIME = '12:00';

const HOUR = 60 * 60 * 1000;

// data: a record from makeInviteData. Returns the start in the runtime's local time, or null without a date.
export function eventStart(data) {
  if (!data.date) return null;
  const [y, mo, day] = data.date.split('-').map(Number);
  const [h, m] = (data.time || DEFAULT_TIME).split(':').map(Number);
  return new Date(y, mo - 1, day, h, m);
}

// Local calendar days from the day of now to the day of start. A daylight saving change makes a day 23 or 25 hours
// long, so the count compares dates rather than dividing the time left by 24 hours.
const calendarDays = (start, now) =>
  Math.round(
    (Date.UTC(start.getFullYear(), start.getMonth(), start.getDate()) -
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) /
      (24 * HOUR),
  );

// The time left from now to start: {unit: 'hours', count} on the start's day or in the last 24 hours, with the hours
// rounded up, otherwise {unit: 'days', count} in calendar days. Returns null without a start or once it has passed.
export function countdown(start, now) {
  if (!start) return null;
  const left = start.getTime() - now.getTime();
  if (left <= 0) return null;
  const days = calendarDays(start, now);
  if (days === 0 || left < 24 * HOUR) return { unit: 'hours', count: Math.ceil(left / HOUR) };
  return { unit: 'days', count: days };
}
