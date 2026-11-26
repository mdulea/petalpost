// The time left before an event, and RSVP deadline checks in Europe/Bucharest time. No DOM access, so
// tests/check-countdown.js runs it in Node. Event dates and times are floating local time. They read the same
// wall-clock time in every time zone, so the countdown and the calendar file use the time zone of the browser that
// shows them. RSVP deadlines and the deletion of a guest list are checked in Europe/Bucharest time.

// The start time of an event without a time.
const DEFAULT_TIME = '12:00';
const RSVP_TIMEZONE = 'Europe/Bucharest';

const HOUR = 60 * 60 * 1000;
const BUCHAREST_DATE = new Intl.DateTimeFormat('en-US', {
  timeZone: RSVP_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const BUCHAREST_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: RSVP_TIMEZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
});
// The tracker nudges the host this many calendar days before the RSVP deadline and before the deletion.
const DEADLINE_NUDGE_DAYS = 7;
const DELETION_NUDGE_DAYS = 3;

// True when value is a real calendar date in YYYY-MM-DD format.
export const isValidDate = (value) =>
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Boolean(new Date(`${value}T00:00Z`).toJSON()?.startsWith(value));

// The calendar date (YYYY-MM-DD) of now in Europe/Bucharest time.
export function bucharestDate(now = new Date()) {
  const parts = Object.fromEntries(BUCHAREST_DATE.formatToParts(now).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

// True when an optional YYYY-MM-DD RSVP deadline has passed in Europe/Bucharest time. The deadline day itself stays
// open until 23:59:59 Europe/Bucharest time, and without a deadline replies stay open.
export const isDeadlinePassed = (deadline, now = new Date()) =>
  Boolean(isValidDate(deadline) && bucharestDate(now) > deadline);

// data: a record from makeInviteData. Returns the start as [year, month index, day, hour, minute] in the argument
// order of Date and Date.UTC, or null without a date.
/** @returns {[number, number, number, number, number] | null} */
export function eventFields(data) {
  if (!data.date) return null;
  const [y, mo, day] = data.date.split('-').map(Number);
  const [h, m] = (data.time || DEFAULT_TIME).split(':').map(Number);
  return [y, mo - 1, day, h, m];
}

// data: a record from makeInviteData. Returns the start in the runtime's local time, or null without a date.
export function eventStart(data) {
  const fields = eventFields(data);
  return fields && new Date(...fields);
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

// The milliseconds Europe/Bucharest time is ahead of UTC at instant, a whole minute in milliseconds.
function bucharestOffset(instant) {
  const parts = Object.fromEntries(
    BUCHAREST_TIME.formatToParts(instant).map(({ type, value }) => [type, Number(value)]),
  );
  return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - instant;
}

// The instant of 23:59 Europe/Bucharest time, days after a YYYY-MM-DD date. The second offset lookup corrects a first
// guess that falls on the other side of a daylight saving change.
function bucharestEndOfDay(date, days) {
  const [y, mo, d] = date.split('-').map(Number);
  const wall = Date.UTC(y, mo - 1, d + days, 23, 59);
  return new Date(wall - bucharestOffset(wall - bucharestOffset(wall)));
}

// The last minute in which guests can reply before an optional YYYY-MM-DD RSVP deadline, or null without one.
export const deadlineEnd = (deadline) => (isValidDate(deadline) ? bucharestEndOfDay(deadline, 0) : null);

// The time from which the daily retention run in server/routes/retention.js deletes a guest-list invitation: 23:59
// Europe/Bucharest time on the day after its YYYY-MM-DD event date. Returns null without a valid date.
export const deletionStart = (date) => (isValidDate(date) ? bucharestEndOfDay(date, 1) : null);

const inLastDays = (left, days) => left.unit === 'hours' || left.count <= days;

// What the tracker of a guest-list invitation shows as due. deadline and date: the invitation's RSVP deadline and
// event date; pending: the parties without a reply. Returns {deadline, deletion}. deadline is null or {left, nudge},
// where left is a countdown() result and nudge is true in the last DEADLINE_NUDGE_DAYS days while a party has not
// replied. deletion is null without a date, otherwise {left, nudge} with nudge true in the last DELETION_NUDGE_DAYS
// days. Once the deletion has started, left is null and nudge true until the next daily retention run deletes the
// invitation.
export function trackerDue({ deadline, date }, pending, now) {
  const deadlineLeft = countdown(deadlineEnd(deadline), now);
  const start = deletionStart(date);
  const deletionLeft = countdown(start, now);
  return {
    deadline: deadlineLeft && {
      left: deadlineLeft,
      nudge: pending > 0 && inLastDays(deadlineLeft, DEADLINE_NUDGE_DAYS),
    },
    deletion: start && { left: deletionLeft, nudge: !deletionLeft || inLastDays(deletionLeft, DELETION_NUDGE_DAYS) },
  };
}
