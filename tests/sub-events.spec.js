// Fails when sub-events break in the browser, in English and Romanian. Checks: the host adds, changes, reorders and
// removes sub-events in the editor, the preview and a reload keep them, and the add button stops at the cap; the
// guest view of the published invitation lists each sub-event's name, date, time and venue, and its calendar file
// has one entry for each sub-event; an invitation without sub-events shows no schedule, has one calendar entry and
// takes a reply as before; no page breaks the Content-Security-Policy or throws.
import { expect, test } from '@playwright/test';
import { UI } from '../public/js/i18n.js';
import { MAX_SUB_EVENTS } from '../public/js/invite.js';
import { formatWhen } from '../public/js/templates.js';
import { newBrowser } from './browser-setup.js';

const LANGS = [
  { lang: 'en', editor: 'editor.html?t=wedding', locale: 'en-US' },
  { lang: 'ro', editor: 'ro/editor.html?t=cununie-verighete', locale: 'ro-RO' },
];

// Adds a sub-event and fills the fields of its name, date, time and venue.
async function addSubEvent(page, { name, date, time, venue }) {
  await page.click('#addSubEvent');
  const item = page.locator('#subEvents > li').last();
  await expect(item.locator('[data-field="name"]')).toBeFocused();
  await item.locator('[data-field="name"]').fill(name);
  await item.locator('[data-field="date"]').fill(date);
  await item.locator('[data-field="time"]').fill(time);
  await item.locator('[data-field="venue"]').fill(venue);
}

const subEventNames = (page) =>
  page.locator('#subEvents [data-field="name"]').evaluateAll((els) => els.map((el) => el.value));

// The calendar file of the opened guest view: the SUMMARY and DTSTART of each entry.
async function calendarEntries(page) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#addCalendar')]);
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  const ics = Buffer.concat(chunks).toString('utf8').replace(/\r\n /g, '');
  return ics
    .split('BEGIN:VEVENT')
    .slice(1)
    .map((e) => e.split('\r\n').filter((l) => /^(SUMMARY|DTSTART):/.test(l)));
}

const civil = { name: 'Civil', date: '2027-06-12', time: '11:00', venue: 'City Hall' };
const church = { name: 'Church', date: '2027-06-12', time: '14:00', venue: 'St. Mary' };
const dinner = { name: 'Dinner', date: '2027-06-13', time: '19:30', venue: 'Lake House' };

for (const { lang, editor, locale } of LANGS) {
  const copy = UI[lang].editor;

  test(`in ${lang}, a host adds, changes, reorders and removes sub-events, and guests see each one and get one calendar entry for each`, async ({
    browser,
  }) => {
    const host = await newBrowser(browser);
    const { page } = host;
    await page.goto(editor);
    await page.fill('#title', 'Ana & Mihai');
    await addSubEvent(page, { ...civil, name: 'Party' });
    await addSubEvent(page, church);
    await addSubEvent(page, dinner);
    await page.locator('#sub0-name').fill(civil.name);
    await page.getByRole('button', { name: copy.subEvent(3).upLabel }).click();
    await expect(page.getByRole('button', { name: copy.subEvent(2).upLabel })).toBeFocused();
    expect(await subEventNames(page)).toEqual(['Civil', 'Dinner', 'Church']);
    await page.getByRole('button', { name: copy.subEvent(2).removeLabel }).click();
    await expect(page.locator('#sub1-name')).toBeFocused();
    expect(await subEventNames(page)).toEqual(['Civil', 'Church']);
    await expect(page.locator('#scheduleList .schedule-name')).toHaveText(['Civil', 'Church']);

    // The editor stores the draft 250ms after the last change, so the reload waits for it.
    const key = lang === 'ro' ? 'petalpost:ro:draft' : 'petalpost:draft';
    await expect
      .poll(() => page.evaluate((k) => JSON.parse(localStorage.getItem(k)).d.subEvents.map((s) => s.name), key))
      .toEqual(['Civil', 'Church']);
    await page.reload();
    expect(await subEventNames(page)).toEqual(['Civil', 'Church']);
    await expect(page.locator('#sub1-venue')).toHaveValue(church.venue);

    await page.click('#publish');
    await expect(page.locator('#eventLink')).toHaveValue(/\/e\/[A-Za-z0-9_-]{22}$/);
    const guest = await newBrowser(browser);
    await guest.page.goto(await page.locator('#eventLink').inputValue());
    const items = guest.page.locator('#scheduleList > li');
    await expect(items).toHaveCount(2);
    for (const [i, s] of [civil, church].entries()) {
      await expect(items.nth(i).locator('.schedule-name')).toHaveText(s.name);
      await expect(items.nth(i).locator('.schedule-when')).toHaveText(formatWhen(s.date, s.time, locale));
      await expect(items.nth(i).locator('.schedule-venue')).toHaveText(s.venue);
    }
    expect(await calendarEntries(guest.page)).toEqual([
      ['DTSTART:20270612T110000', 'SUMMARY:Ana & Mihai: Civil'],
      ['DTSTART:20270612T140000', 'SUMMARY:Ana & Mihai: Church'],
    ]);
    expect([...host.problems, ...guest.problems]).toEqual([]);
  });

  test(`in ${lang}, an invitation without sub-events shows no schedule, has one calendar entry and takes a reply`, async ({
    browser,
  }) => {
    const host = await newBrowser(browser);
    const { page } = host;
    await page.goto(editor);
    await page.fill('#title', 'Ana & Mihai');
    await page.fill('#date', '2027-06-12');
    await page.fill('#time', '16:00');
    await expect(page.locator('#subEvents > li')).toHaveCount(0);
    await page.click('#publish');
    await expect(page.locator('#eventLink')).toHaveValue(/\/e\/[A-Za-z0-9_-]{22}$/);
    const guest = await newBrowser(browser);
    await guest.page.goto(await page.locator('#eventLink').inputValue());
    await expect(guest.page.locator('#rsvpForm')).toBeVisible();
    await expect(guest.page.locator('#schedule')).toBeHidden();
    expect(await calendarEntries(guest.page)).toEqual([['DTSTART:20270612T160000', 'SUMMARY:Ana & Mihai']]);
    await guest.page.fill('#guestName', 'Sam');
    await guest.page.click('#sendReply');
    await expect(guest.page.locator('#replyOutcome')).toHaveText(copy.replySent);
    expect([...host.problems, ...guest.problems]).toEqual([]);
  });
}

test(`the add button stops at ${MAX_SUB_EVENTS} sub-events`, async ({ page }) => {
  await page.goto('editor.html?t=wedding');
  for (let i = 0; i < MAX_SUB_EVENTS; i += 1) await page.click('#addSubEvent');
  await expect(page.locator('#subEvents > li')).toHaveCount(MAX_SUB_EVENTS);
  await expect(page.locator('#addSubEvent')).toBeDisabled();
});
