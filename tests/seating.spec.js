// Checks table creation, renaming, resizing, removal, over-capacity counts, assignment by keyboard, touch or drag,
// the drop animation with and without reduced motion, the printed seating plan, and that only a published
// plan shows a seated party its table on the personal link.
// Run: pnpm test:browser tests/seating.spec.js
import { expect, test } from '@playwright/test';
import { readCredential, viewLink, viewLinkSecret } from '../public/js/rsvp.js';
import { newBrowser } from './browser-setup.js';

// The table rows of the seating plan. Each table row has a heading with the table name; its party rows have none.
const tableRows = (plan) => plan.getByRole('listitem').filter({ has: plan.page().getByRole('heading') });

const COPY = {
  en: {
    editor: '/editor.html?t=birthday',
    heading: 'Seating plan',
    addTable: 'Add table',
    tableName: 'Table name or number',
    capacity: 'Capacity',
    addParty: 'Add to guest list',
    picker: 'Move to table',
    move: 'Move party',
    save: 'Save table',
    remove: 'Remove table',
    over: 'Over capacity by 1',
    seats: '3 filled, 2 free',
    publish: 'Publish seating plan',
    unpublish: 'Unpublish seating plan',
    published: 'Guests see their table on their personal link.',
    unpublished: 'Guests do not see their table yet.',
    guestTable: 'Your table',
  },
  ro: {
    editor: '/ro/editor.html?t=botez-porumbel',
    heading: 'Planul meselor',
    addTable: 'Adaugă o masă',
    tableName: 'Numele sau numărul mesei',
    capacity: 'Număr de locuri',
    addParty: 'Adaugă pe lista de invitați',
    picker: 'Mută la masă',
    move: 'Mută grupul',
    save: 'Salvează masa',
    remove: 'Elimină masa',
    over: 'Peste capacitate cu 1 loc',
    seats: '3 locuri ocupate, 2 libere',
    publish: 'Publică planul meselor',
    unpublish: 'Retrage planul meselor',
    published: 'Invitații își văd masa pe linkul personal.',
    unpublished: 'Invitații nu își văd încă masa.',
    guestTable: 'Masa ta',
  },
};

for (const lang of ['en', 'ro']) {
  const words = COPY[lang];

  test(`in ${lang}, the host seats a party and edits and removes its table`, async ({ browser }) => {
    const touch = lang === 'ro';
    const { page, problems } = await newBrowser(
      browser,
      touch ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : {},
    );
    await page.goto(words.editor);
    await page.check('input[name="mode"][value="guestList"]');
    await page.fill('#title', 'Daria');
    await page.click('#publish');
    const manage = page.locator('#manageLink');
    await expect(manage).toHaveValue(/manage\.html#/);
    await page.goto(await manage.inputValue());
    const plan = page.getByRole('region', { name: words.heading });
    const addTable = plan.getByRole('form', { name: words.addTable });
    await addTable.getByLabel(words.tableName).fill('7');
    await addTable.getByLabel(words.capacity).fill('2');
    await addTable.getByRole('button', { name: words.addTable }).click();
    const table = tableRows(plan);
    await expect(table.getByLabel(words.tableName)).toHaveValue('7');
    await page.locator('#partyName').fill('Familia Radu');
    await page.locator('#defaultSeats').fill('3');
    await page.getByRole('button', { name: words.addParty }).click();
    const link = page.locator('#partyList input[readonly]');
    await expect(link).toHaveValue(/#p=/);
    const guest = await newBrowser(browser);
    await guest.page.goto(await link.inputValue());
    const reply = guest.page.locator('#personalReply');
    await expect(reply.locator('[name="partySize"]')).toHaveValue('3');
    await reply.locator('button[type="submit"]').click();
    await expect(reply.getByRole('status')).toHaveText(/Reply sent|Răspuns trimis/);
    const picker = page.getByRole('combobox', { name: new RegExp(words.picker) });
    const move = page.getByRole('button', { name: words.move });
    if (touch) {
      await picker.tap();
      await picker.selectOption({ label: '7' });
      await move.tap();
    } else {
      await picker.focus();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Tab');
      await expect(move).toBeFocused();
      await page.keyboard.press('Enter');
    }
    await expect(table).toContainText(words.over);
    await page.reload();
    await expect(picker.locator('option:checked')).toHaveText('7');
    await table.getByLabel(words.tableName).fill('8');
    await table.getByLabel(words.capacity).fill('5');
    await table.getByRole('button', { name: words.save }).click();
    await expect(table).toContainText(words.seats);
    await expect(picker.locator('option:checked')).toHaveText('8');
    page.once('dialog', (dialog) => dialog.accept());
    await table.getByRole('button', { name: words.remove }).click();
    await expect(table).toHaveCount(0);
    await expect(picker).toHaveValue('');
    expect([...problems, ...guest.problems]).toEqual([]);
  });
}

// Opens the tracker of a new guest-list invitation with table 7 for 5 and Familia Radu, who accepted for 3 people.
async function trackerWithTable(browser, options = {}) {
  const words = COPY.en;
  const host = await newBrowser(browser, options);
  const { page } = host;
  await page.goto(words.editor);
  await page.check('input[name="mode"][value="guestList"]');
  await page.fill('#title', 'Daria');
  await page.click('#publish');
  const manage = page.locator('#manageLink');
  await expect(manage).toHaveValue(/manage\.html#/);
  await page.goto(await manage.inputValue());
  const plan = page.getByRole('region', { name: words.heading });
  const addTable = plan.getByRole('form', { name: words.addTable });
  await addTable.getByLabel(words.tableName).fill('7');
  await addTable.getByLabel(words.capacity).fill('5');
  await addTable.getByRole('button', { name: words.addTable }).click();
  await expect(tableRows(plan)).toHaveCount(1);
  await page.locator('#partyName').fill('Familia Radu');
  await page.locator('#defaultSeats').fill('3');
  await page.getByRole('button', { name: words.addParty }).click();
  const link = page.locator('#partyList input[readonly]');
  await expect(link).toHaveValue(/#p=/);
  const guest = await newBrowser(browser);
  await guest.page.goto(await link.inputValue());
  const reply = guest.page.locator('#personalReply');
  await reply.locator('button[type="submit"]').click();
  await expect(reply.getByRole('status')).toHaveText('Reply sent');
  await page.reload();
  return { page, plan, problems: [...host.problems, ...guest.problems] };
}

// Headless Chromium does not scroll during a drag, so the viewport fits the party list and the seating plan. The
// reminder and deadline sections sit between them, which puts the table row below 2400 pixels.
const DESKTOP = { viewport: { width: 1280, height: 3600 } };

test('the host drags a party onto a table to seat it there', async ({ browser }) => {
  const { page, plan, problems } = await trackerWithTable(browser, DESKTOP);
  await page.locator('#partyList').getByText('Familia Radu', { exact: true }).dragTo(tableRows(plan));
  await expect(tableRows(plan)).toContainText(COPY.en.seats);
  await expect(page.getByRole('combobox', { name: /Move to table/ }).locator('option:checked')).toHaveText('7');
  expect(problems).toEqual([]);
});

for (const reducedMotion of ['no-preference', 'reduce']) {
  test(`with ${reducedMotion} motion, a dropped party ${reducedMotion === 'reduce' ? 'animates nothing' : 'lands with an animation'}`, async ({
    browser,
  }) => {
    const { page, plan, problems } = await trackerWithTable(browser, { ...DESKTOP, reducedMotion });
    await page.evaluate(() => {
      const counts = /** @type {any} */ (window);
      const animate = Element.prototype.animate;
      counts.animations = 0;
      Element.prototype.animate = function (...args) {
        counts.animations += 1;
        return animate.apply(this, args);
      };
    });
    await page.locator('#partyList').getByText('Familia Radu', { exact: true }).dragTo(tableRows(plan));
    await expect(tableRows(plan)).toContainText(COPY.en.seats);
    expect(await page.evaluate(() => /** @type {any} */ (window).animations)).toBe(reducedMotion === 'reduce' ? 0 : 1);
    expect(problems).toEqual([]);
  });
}

test('the printed seating plan lists each table with its parties and seats', async ({ browser }) => {
  const { page, plan, problems } = await trackerWithTable(browser);
  await page.getByRole('combobox', { name: /Move to table/ }).selectOption({ label: '7' });
  await page.getByRole('button', { name: COPY.en.move }).click();
  await expect(tableRows(plan).getByRole('listitem')).toHaveText('Familia Radu · 3 seats');
  await page.evaluate(() => {
    const counts = /** @type {any} */ (window);
    counts.printed = 0;
    window.print = () => (counts.printed += 1);
  });
  await plan.getByRole('button', { name: 'Print seating plan' }).click();
  expect(await page.evaluate(() => /** @type {any} */ (window).printed)).toBe(1);
  await page.emulateMedia({ media: 'print' });
  const table = tableRows(plan);
  await expect(table.getByRole('heading')).toHaveText('7');
  await expect(table).toBeVisible();
  await expect(table.getByText(COPY.en.seats)).toBeVisible();
  await expect(table.getByText('Familia Radu · 3 seats')).toBeVisible();
  await expect(table.getByRole('form')).toBeHidden();
  await expect(plan.getByRole('button', { name: 'Print seating plan' })).toBeHidden();
  await expect(plan.locator('#seatingSummary')).toBeHidden();
  await expect(page.getByRole('region', { name: 'Guest list' })).toBeHidden();
  await expect(page.locator('.site-header')).toBeHidden();
  expect(problems).toEqual([]);
});

for (const lang of ['en', 'ro']) {
  const words = COPY[lang];

  test(`in ${lang}, only a published plan shows a seated party its table on the personal link`, async ({ browser }) => {
    const { page, problems } = await newBrowser(browser);
    await page.goto(words.editor);
    await page.check('input[name="mode"][value="guestList"]');
    await page.fill('#title', 'Daria');
    await page.click('#publish');
    const manage = page.locator('#manageLink');
    await expect(manage).toHaveValue(/manage\.html#/);
    await page.goto(await manage.inputValue());
    const plan = page.getByRole('region', { name: words.heading });
    const addTable = plan.getByRole('form', { name: words.addTable });
    await addTable.getByLabel(words.tableName).fill('Window');
    await addTable.getByLabel(words.capacity).fill('4');
    await addTable.getByRole('button', { name: words.addTable }).click();
    await expect(tableRows(plan)).toHaveCount(1);
    const links = {};
    for (const name of ['Familia Radu', 'Sam']) {
      await page.locator('#partyName').fill(name);
      await page.getByRole('button', { name: words.addParty }).click();
      const link = page.locator('#partyList li').filter({ hasText: name }).locator('input[readonly]');
      await expect(link).toHaveValue(/#p=/);
      links[name] = await link.inputValue();
    }
    await page.getByRole('combobox', { name: `${words.picker} · Familia Radu` }).selectOption({ label: 'Window' });
    await page
      .locator('#partyList li')
      .filter({ hasText: 'Familia Radu' })
      .getByRole('button', { name: words.move })
      .click();
    await expect(tableRows(plan)).toHaveCount(1);
    const summary = plan.locator('#seatingSummary');
    await expect(summary).toHaveText(words.unpublished);

    const guest = await newBrowser(browser);
    const tableRegion = guest.page.getByRole('region', { name: words.guestTable });
    const openPersonal = async (link) => {
      await guest.page.goto('about:blank');
      await guest.page.goto(link);
      await expect(guest.page.locator('#personalReply')).toBeVisible();
    };
    await openPersonal(links['Familia Radu']);
    await expect(tableRegion).toHaveCount(0);

    await plan.getByRole('button', { name: words.publish }).click();
    await expect(summary).toHaveText(words.published);
    await openPersonal(links['Familia Radu']);
    await expect(tableRegion).toContainText('Window');
    await openPersonal(links.Sam);
    await expect(tableRegion).toHaveCount(0);
    await guest.page.goto('about:blank');
    const [invitation, hash] = links['Familia Radu'].split('#');
    const personal = readCredential(`#${hash}`, 'p=');
    await guest.page.goto(viewLink(invitation, personal.id, await viewLinkSecret(personal.secret, personal.id)));
    await expect(guest.page.locator('#personalSections h2')).toContainText('Familia Radu');
    await expect(tableRegion).toHaveCount(0);
    await guest.page.goto(invitation);
    await expect(guest.page.locator('#guestListNotice')).toBeVisible();
    await expect(guest.page.getByText('Window')).toHaveCount(0);

    await plan.getByRole('button', { name: words.unpublish }).click();
    await expect(summary).toHaveText(words.unpublished);
    await openPersonal(links['Familia Radu']);
    await expect(tableRegion).toHaveCount(0);
    expect([...problems, ...guest.problems]).toEqual([]);
  });
}
