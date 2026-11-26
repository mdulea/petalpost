// Fails when the meal counts of a reply break in the browser, in English and Romanian. Checks: the host adds, names
// and removes menu options in the editor up to 6; an open-mode guest gives a count for each option, counts that do
// not add up show an error on the meal counts, and the reply edit link shows the counts again; the management page
// lists each reply's counts and the meal totals, and its CSV has a column for each option; a guest-list party gives
// the counts through its personal link, and the tracker shows them and the totals and changes them with the seats; an
// invitation without menu options shows no meal counts; no page breaks the Content-Security-Policy or throws.
// Run: pnpm test:browser tests/meal-choices.spec.js
import { expect, test } from '@playwright/test';
import { UI } from '../public/js/i18n.js';
import { newBrowser } from './browser-setup.js';

const LANGS = [
  { lang: 'en', editor: 'editor.html?t=wedding' },
  { lang: 'ro', editor: 'ro/editor.html?t=cununie-verighete' },
];

// Adds a menu option for each name in the editor.
async function addMenu(page, names) {
  for (const name of names) {
    await page.click('#addMenuOption');
    await page.locator('#menuOptions input').last().fill(name);
  }
}

// Fills the count of each option name in counts within the meal fieldset of form.
async function fillMeals(form, counts, copy) {
  const fieldset = form.getByRole('group', { name: copy.legend });
  for (const [name, count] of Object.entries(counts)) await fieldset.getByLabel(name).fill(String(count));
}

// The text of the downloaded CSV after the click on selector.
async function csvText(page, selector) {
  const [download] = await Promise.all([page.waitForEvent('download'), page.click(selector)]);
  const chunks = [];
  for await (const chunk of await download.createReadStream()) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

for (const { lang, editor } of LANGS) {
  const copy = UI[lang].menu;
  const counts = (pairs) => copy.counts(pairs.map(([name, count]) => copy.count({ name, count })).join(', '));

  test(`in ${lang}, an open-mode guest gives meal counts and the management page shows the counts and totals`, async ({
    browser,
  }) => {
    const host = await newBrowser(browser);
    await host.page.goto(editor);
    await host.page.fill('#title', 'Ana & Mihai');
    await addMenu(host.page, ['Standard', 'Vegetarian']);
    await host.page.click('#publish');
    await expect(host.page.locator('#eventLink')).toHaveValue(/\/e\/[A-Za-z0-9_-]{22}$/);
    const invitation = await host.page.locator('#eventLink').inputValue();
    const manage = await host.page.locator('#manageLink').inputValue();

    const guest = await newBrowser(browser);
    await guest.page.goto(invitation);
    const form = guest.page.locator('#rsvpForm');
    await guest.page.fill('#guestName', 'Sam');
    await guest.page.fill('#partySize', '3');
    await fillMeals(form, { Standard: 1, Vegetarian: 1 }, copy);
    await guest.page.click('#sendReply');
    await expect(guest.page.locator('#mealsError')).toHaveText(copy.error);
    await expect(form.getByLabel('Standard')).toBeFocused();
    await fillMeals(form, { Standard: 2 }, copy);
    await guest.page.click('#sendReply');
    await expect(guest.page.locator('#replyOutcome')).toHaveText(UI[lang].guest.replySent);
    await guest.page.reload();
    await expect(guest.page.locator('#rsvpStatus')).toHaveText(UI[lang].guest.savedReplyShown);
    await expect(form.getByLabel('Standard')).toHaveValue('2');
    await expect(form.getByLabel('Vegetarian')).toHaveValue('1');

    await host.page.goto(manage);
    await expect(host.page.locator('#responseList > li')).toContainText(
      counts([
        ['Standard', 2],
        ['Vegetarian', 1],
      ]),
    );
    await expect(host.page.locator('#totals .meal-total')).toHaveText([
      copy.totals({ name: 'Standard', count: 2 }),
      copy.totals({ name: 'Vegetarian', count: 1 }),
    ]);
    const header = (await csvText(host.page, '#downloadCsv')).split('\r\n')[0];
    expect(header).toContain(UI[lang].csv.separator + copy.csvCount('Vegetarian') + UI[lang].csv.separator);
    expect([...host.problems, ...guest.problems]).toEqual([]);
  });

  test(`in ${lang}, a guest-list party gives meal counts and the host changes them with the seats`, async ({
    browser,
  }) => {
    const host = await newBrowser(browser);
    await host.page.goto(editor);
    await addMenu(host.page, ['Standard', 'Child']);
    await host.page.check('input[name="mode"][value="guestList"]');
    await host.page.click('#publish');
    await expect(host.page.locator('#manageLink')).toHaveValue(/manage\.html#/);
    await host.page.goto(await host.page.locator('#manageLink').inputValue());
    await host.page.locator('#partyName').fill('Familia Radu');
    await host.page.locator('#partyLang').selectOption(lang);
    await host.page.locator('#addParty button[type="submit"]').click();
    const row = host.page.locator('#partyList > li').filter({ hasText: 'Familia Radu' });
    await expect(row).toBeVisible();
    const personal = await row.locator('input[readonly]').first().inputValue();

    const guest = await newBrowser(browser);
    await guest.page.goto(personal);
    const form = guest.page.locator('#personalReply');
    await form.locator('#personalSeats').fill('3');
    await fillMeals(form, { Standard: 2, Child: 1 }, copy);
    await form.locator('button[type="submit"]').click();
    await expect(form.getByRole('status')).toHaveText(UI[lang].guest.replySent);

    await host.page.locator('#refreshParties').click();
    await expect(row).toContainText(
      counts([
        ['Standard', 2],
        ['Child', 1],
      ]),
    );
    const seatInput = host.page.getByRole('spinbutton', { name: `${UI[lang].guestList.seatsLabel} · Familia Radu` });
    await seatInput.fill('4');
    await fillMeals(row.locator('form').filter({ has: seatInput }), { Child: 2 }, copy);
    await row.getByRole('button', { name: UI[lang].guestList.saveSeats }).click();
    await expect(host.page.locator('#partyStatus')).toHaveText(UI[lang].guestList.seatsSaved);
    await expect(row).toContainText(
      counts([
        ['Standard', 2],
        ['Child', 2],
      ]),
    );
    await expect(host.page.locator('#partyTotals .meal-total')).toHaveText([
      copy.totals({ name: 'Standard', count: 2 }),
      copy.totals({ name: 'Child', count: 2 }),
    ]);
    const header = (await csvText(host.page, '#downloadGuestList')).split('\r\n')[0];
    expect(header).toContain(copy.csvCount('Child'));
    expect([...host.problems, ...guest.problems]).toEqual([]);
  });
}

test('the editor stops at 6 menu options, and an invitation without them shows no meal counts', async ({ browser }) => {
  const host = await newBrowser(browser);
  await host.page.goto('editor.html?t=wedding');
  await addMenu(host.page, ['A', 'B', 'C', 'D', 'E', 'F']);
  await expect(host.page.locator('#addMenuOption')).toBeDisabled();
  for (let i = 0; i < 6; i++) await host.page.locator('#menuOptions button').first().click();
  await expect(host.page.locator('#menuOptions li')).toHaveCount(0);
  await expect(host.page.locator('#addMenuOption')).toBeFocused();
  await host.page.click('#publish');
  await expect(host.page.locator('#eventLink')).toHaveValue(/\/e\/[A-Za-z0-9_-]{22}$/);
  const guest = await newBrowser(browser);
  await guest.page.goto(await host.page.locator('#eventLink').inputValue());
  await guest.page.fill('#guestName', 'Sam');
  await expect(guest.page.locator('.meal-counts')).toHaveCount(0);
  await guest.page.click('#sendReply');
  await expect(guest.page.locator('#replyOutcome')).toHaveText(UI.en.guest.replySent);
  expect([...host.problems, ...guest.problems]).toEqual([]);
});
