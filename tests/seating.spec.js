// Checks table creation, renaming, resizing, removal, over-capacity counts and assignment by keyboard or touch.
// Run: pnpm test:browser tests/seating.spec.js
import { expect, test } from '@playwright/test';
import { newBrowser } from './browser-setup.js';

const COPY = {
  en: {
    editor: '/editor.html?t=birthday',
    heading: 'Seating plan',
    addTable: 'Add table',
    tableName: 'Table name or number',
    capacity: 'Capacity',
    addParty: 'Add party',
    partyName: 'Party name',
    picker: 'Move to table',
    move: 'Move party',
    save: 'Save table',
    remove: 'Remove table',
    over: 'Over capacity by 1',
    seats: '3 filled, 2 free',
  },
  ro: {
    editor: '/ro/editor.html?t=botez-porumbel',
    heading: 'Planul meselor',
    addTable: 'Adaugă o masă',
    tableName: 'Numele sau numărul mesei',
    capacity: 'Număr de locuri',
    addParty: 'Adaugă un grup',
    partyName: 'Numele grupului',
    picker: 'Mută la masă',
    move: 'Mută grupul',
    save: 'Salvează masa',
    remove: 'Elimină masa',
    over: 'Peste capacitate cu 1 loc',
    seats: '3 locuri ocupate, 2 libere',
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
    const table = plan.getByRole('listitem');
    await expect(table.getByLabel(words.tableName)).toHaveValue('7');
    await page.getByLabel(words.partyName, { exact: true }).fill('Familia Radu');
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
