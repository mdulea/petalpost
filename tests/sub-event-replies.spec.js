// Fails when the answers of a reply to each sub-event break in the browser, in English and Romanian. Checks: an
// open-mode guest answers each sub-event in place of the single answer, and the reply edit link shows the answers
// again; the management page lists each reply's answers and the totals of each sub-event, and its CSV has a column
// pair for each sub-event; a guest-list party answers each sub-event through its personal link, and the tracker shows
// the answers and totals, edits them through the reply form and replaces the seat editor with a hint; a reply saved
// before the host added sub-events shows no answer to them in the tracker and no checked choice on its edit link; no
// page breaks the Content-Security-Policy or throws.
// Run: pnpm test:browser tests/sub-event-replies.spec.js
import { expect, test } from '@playwright/test';
import { UI } from '../public/js/i18n.js';
import { newBrowser } from './browser-setup.js';

const LANGS = [
  { lang: 'en', editor: 'editor.html?t=wedding' },
  { lang: 'ro', editor: 'ro/editor.html?t=cununie-verighete' },
];

const civil = { name: 'Civil', date: '2027-06-12', time: '11:00', venue: 'City Hall' };
const church = { name: 'Church', date: '2027-06-12', time: '14:00', venue: 'St. Mary' };

// Adds a sub-event and fills the fields of its name, date, time and venue.
async function addSubEvent(page, { name, date, time, venue }) {
  await page.click('#addSubEvent');
  const item = page.locator('#subEvents > li').last();
  await item.locator('[data-field="name"]').fill(name);
  await item.locator('[data-field="date"]').fill(date);
  await item.locator('[data-field="time"]').fill(time);
  await item.locator('[data-field="venue"]').fill(venue);
}

// Chooses yes with partySize people, or no when partySize is 0, in the answer fieldset of the sub-event called name.
async function answer(form, name, partySize, copy) {
  const fieldset = form.getByRole('group', { name });
  await fieldset.getByLabel(partySize ? copy.yes : copy.no, { exact: true }).check();
  if (partySize) await fieldset.getByLabel(copy.people).fill(String(partySize));
}

// The text of the downloaded CSV after the click on selector.
async function csvText(page, selector) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

for (const { lang, editor } of LANGS) {
  const copy = UI[lang].subEventReplies;
  const line = (name, a) => copy.line(name, a ? copy.answer(a) : copy.noAnswer);

  test(`in ${lang}, an open-mode guest answers each sub-event and the management page shows the answers and totals`, async ({
    browser,
  }) => {
    const host = await newBrowser(browser);
    await host.page.goto(editor);
    await host.page.fill('#title', 'Ana & Mihai');
    await addSubEvent(host.page, civil);
    await addSubEvent(host.page, church);
    await host.page.click('#publish');
    await expect(host.page.locator('#eventLink')).toHaveValue(/\/e\/[A-Za-z0-9_-]{22}$/);
    const invitation = await host.page.locator('#eventLink').inputValue();
    const manage = await host.page.locator('#manageLink').inputValue();

    const guest = await newBrowser(browser);
    await guest.page.goto(invitation);
    const form = guest.page.locator('#rsvpForm');
    await expect(form.locator('#partySize')).toBeHidden();
    await expect(form.locator('input[name="attending"]').first()).toBeHidden();
    await guest.page.fill('#guestName', 'Sam');
    await answer(form, 'Civil', 2, copy);
    await answer(form, 'Church', 0, copy);
    await guest.page.click('#sendReply');
    await expect(guest.page.locator('#replyOutcome')).toHaveText(UI[lang].guest.replySent);
    await guest.page.reload();
    await expect(guest.page.locator('#rsvpStatus')).toHaveText(UI[lang].guest.savedReplyShown);
    await expect(form.getByRole('group', { name: 'Civil' }).getByLabel(copy.people)).toHaveValue('2');
    await expect(form.getByRole('group', { name: 'Church' }).getByLabel(copy.no, { exact: true })).toBeChecked();

    await host.page.goto(manage);
    const reply = host.page.locator('#responseList > li');
    await expect(reply).toContainText(line('Civil', { attending: true, partySize: 2 }));
    await expect(reply).toContainText(line('Church', { attending: false, partySize: 0 }));
    const totals = host.page.locator('#totals .total-line');
    await expect(totals).toHaveText([
      copy.totals({ name: 'Civil', yes: 1, no: 0, attending: 2, unanswered: 0 }),
      copy.totals({ name: 'Church', yes: 0, no: 1, attending: 0, unanswered: 0 }),
    ]);
    const header = (await csvText(host.page, '#downloadCsv')).split('\r\n')[0];
    expect(header).toContain(UI[lang].csv.separator + copy.csvPeople('Church') + UI[lang].csv.separator);
    expect([...host.problems, ...guest.problems]).toEqual([]);
  });

  test(`in ${lang}, a guest-list party answers each sub-event and the host edits the answers in the tracker`, async ({
    browser,
  }) => {
    const host = await newBrowser(browser);
    await host.page.goto(editor);
    await addSubEvent(host.page, civil);
    await addSubEvent(host.page, church);
    await host.page.check('input[name="mode"][value="guestList"]');
    await host.page.click('#publish');
    await expect(host.page.locator('#manageLink')).toHaveValue(/manage\.html#/);
    await host.page.goto(await host.page.locator('#manageLink').inputValue());
    await host.page.locator('#partyName').fill('Familia Radu');
    await host.page.locator('#partyLang').selectOption(lang);
    await host.page.locator('#addParty button[type="submit"]').click();
    const row = host.page.locator('#partyList > li').filter({ hasText: 'Familia Radu' });
    await expect(row).toBeVisible();
    await expect(row.locator('input[name="partySize"]')).toHaveCount(0);
    await expect(row.getByText(copy.seatsBySubEvent)).toBeVisible();
    const personal = await row.locator('input[readonly]').first().inputValue();

    const guest = await newBrowser(browser);
    await guest.page.goto(personal);
    const form = guest.page.locator('#personalReply');
    await expect(form.locator('#personalSeats')).toHaveCount(0);
    await answer(form, 'Civil', 3, copy);
    await answer(form, 'Church', 0, copy);
    await form.locator('button[type="submit"]').click();
    await expect(form.getByRole('status')).toHaveText(UI[lang].guest.replySent);

    await host.page.locator('#refreshParties').click();
    await expect(row.locator('.sub-event-replies li')).toHaveText([
      line('Civil', { attending: true, partySize: 3 }),
      line('Church', { attending: false, partySize: 0 }),
    ]);
    await row.getByRole('button', { name: UI[lang].guestList.editReply }).click();
    await answer(row, 'Church', 2, copy);
    await row.getByRole('button', { name: UI[lang].guestList.saveReply }).click();
    await expect(host.page.locator('#partyStatus')).toHaveText(UI[lang].guestList.replySaved);
    await expect(row.locator('.sub-event-replies li').last()).toHaveText(
      line('Church', { attending: true, partySize: 2 }),
    );
    await expect(host.page.locator('#partyTotals .total-line')).toHaveText([
      copy.totals({ name: 'Civil', yes: 1, no: 0, attending: 3, unanswered: 0 }),
      copy.totals({ name: 'Church', yes: 1, no: 0, attending: 2, unanswered: 0 }),
    ]);
    const header = (await csvText(host.page, '#downloadGuestList')).split('\r\n')[0];
    expect(header).toContain(copy.csvAnswer('Civil'));
    expect([...host.problems, ...guest.problems]).toEqual([]);
  });
}

test('a reply saved before the host added sub-events shows no answer to them until the guest answers', async ({
  browser,
}) => {
  const copy = UI.en.subEventReplies;
  const host = await newBrowser(browser);
  await host.page.goto('editor.html?t=wedding');
  await host.page.click('#publish');
  await expect(host.page.locator('#eventLink')).toHaveValue(/\/e\/[A-Za-z0-9_-]{22}$/);
  const invitation = await host.page.locator('#eventLink').inputValue();
  const manage = await host.page.locator('#manageLink').inputValue();
  const guest = await newBrowser(browser);
  await guest.page.goto(invitation);
  await guest.page.fill('#guestName', 'Sam');
  await guest.page.click('#sendReply');
  await expect(guest.page.locator('#replyOutcome')).toHaveText(UI.en.guest.replySent);
  const editLink = await guest.page.locator('#replyLink').inputValue();

  await addSubEvent(host.page, civil);
  await host.page.click('#publish');
  await expect(host.page.locator('#publishOutcome')).toHaveText(UI.en.editor.changesPublishedHeading);
  await host.page.goto(manage);
  await expect(host.page.locator('#responseList > li')).toContainText(copy.line('Civil', copy.noAnswer));
  await expect(host.page.locator('#totals .total-line')).toHaveText([
    copy.totals({ name: 'Civil', yes: 0, no: 0, attending: 0, unanswered: 1 }),
  ]);

  await guest.page.goto(editLink);
  await guest.page.reload();
  const civilAnswer = guest.page.locator('#rsvpForm').getByRole('group', { name: 'Civil' });
  await expect(guest.page.locator('#rsvpStatus')).toHaveText(UI.en.guest.savedReplyShown);
  await expect(civilAnswer.getByRole('radio', { checked: true })).toHaveCount(0);
  await guest.page.click('#sendReply');
  await expect(guest.page.locator('#answersError')).toHaveText(copy.error(10));
  await expect(civilAnswer.getByLabel(copy.yes, { exact: true })).toBeFocused();
  expect([...host.problems, ...guest.problems]).toEqual([]);
});
