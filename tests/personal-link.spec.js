// Checks that a host copies a party's personal link, previews the party's page without recording an opened time,
// filters parties by status (not opened, opened, replied), and sees opened times, replies, edits and withdrawal
// in both languages. Also checks revoke, regenerate and the unavailable page in both languages.
// Run: pnpm test:browser tests/personal-link.spec.js
import { expect, test } from '@playwright/test';
import { newBrowser } from './browser-setup.js';

const COPY = {
  en: {
    editor: '/editor.html?t=birthday',
    add: 'Add to guest list',
    copy: 'Copy personal link',
    preview: 'Preview as this guest',
    greeting: 'Hello, Familia Radu!',
    notOpened: 'Not opened',
    opened: 'Opened',
    noReply: 'No reply yet',
    firstOpened: 'First opened',
    lastOpened: 'Last opened',
    sent: 'Reply sent',
    updated: 'Reply updated',
    withdrawn: 'Reply withdrawn',
    decline: 'No, I cannot come',
    copied: 'Personal link copied.',
    revoke: 'Revoke personal link',
    regenerate: 'Regenerate personal link',
    revoked: 'Personal link revoked.',
    regenerated: 'Personal link regenerated.',
    unavailable: 'This link no longer works. Ask the host for a new one.',
  },
  ro: {
    editor: '/ro/editor.html?t=botez-porumbel',
    add: 'Adaugă pe lista de invitați',
    copy: 'Copiază linkul personal',
    preview: 'Previzualizează ca acest invitat',
    greeting: 'Bună, Familia Radu!',
    notOpened: 'Nedeschis',
    opened: 'Deschis',
    noReply: 'Fără răspuns',
    firstOpened: 'Deschis prima dată',
    lastOpened: 'Ultima deschidere',
    sent: 'Răspuns trimis',
    updated: 'Răspuns actualizat',
    withdrawn: 'Răspuns retras',
    decline: 'Nu pot ajunge',
    copied: 'Linkul personal a fost copiat.',
    revoke: 'Revocă linkul personal',
    regenerate: 'Generează un link personal nou',
    revoked: 'Linkul personal a fost revocat.',
    regenerated: 'Noul link personal a fost generat.',
    unavailable: 'Acest link nu mai funcționează. Cere-i gazdei un link nou.',
  },
};

for (const lang of ['en', 'ro']) {
  test(`in ${lang}, a host tracks opened status, previews a party, filters by status and sees replies`, async ({
    browser,
  }) => {
    const copy = COPY[lang];
    const host = await newBrowser(browser, { permissions: ['clipboard-read', 'clipboard-write'] });
    await host.page.goto(copy.editor);
    await host.page.check('input[name="mode"][value="guestList"]');
    await host.page.fill('#title', 'Daria');
    await host.page.click('#publish');
    const manage = host.page.locator('#manageLink');
    await expect(manage).toHaveValue(/manage\.html#/);
    await host.page.goto(await manage.inputValue());

    await host.page.locator('#partyName').fill('Familia Radu', { timeout: 5000 });
    await host.page.locator('#defaultSeats').fill('3');
    await host.page.getByRole('button', { name: copy.add }).click();
    const row = host.page.locator('#partyList li').filter({ hasText: 'Familia Radu' });
    await expect(row).toContainText(copy.notOpened);
    await expect(row).not.toContainText(copy.firstOpened);

    await host.page.locator('#partyName').fill('Familia Dima');
    await host.page.locator('#defaultSeats').fill('2');
    await host.page.getByRole('button', { name: copy.add }).click();
    const otherRow = host.page.locator('#partyList li').filter({ hasText: 'Familia Dima' });
    await expect(otherRow).toContainText(copy.notOpened);

    // Preview as this guest shows the party's greeting without a reply form and records no opened time.
    const [previewPage] = await Promise.all([
      host.page.context().waitForEvent('page'),
      row.getByRole('link', { name: copy.preview }).click(),
    ]);
    await expect(previewPage.locator('#previewCard .invite-title')).toHaveText('Daria');
    await expect(previewPage.getByRole('heading', { name: copy.greeting })).toBeVisible();
    await expect(previewPage.locator('#personalReply')).toHaveCount(0);
    await expect(previewPage.locator('#rsvpForm')).toBeHidden();
    await previewPage.close();

    await host.page.reload();
    await expect(row).toContainText(copy.notOpened);
    await expect(row).not.toContainText(copy.firstOpened);

    await row.getByRole('button', { name: copy.copy }).click();
    await expect(host.page.locator('#partyStatus')).toHaveText(copy.copied);
    const link = await host.page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/\/e\/[\w-]+#p=[\w-]+\.[\w-]+$/);

    const guest = await newBrowser(browser);
    await guest.page.goto(link);
    await expect(guest.page.locator('#previewCard .invite-title')).toHaveText('Daria');
    await expect(guest.page.getByRole('heading', { name: copy.greeting })).toBeVisible();

    await host.page.reload();
    await expect(row).toContainText(copy.opened);
    await expect(row).toContainText(copy.firstOpened);
    await expect(row).toContainText(copy.lastOpened);

    const filter = host.page.locator('#partyFilter');
    const visibleRows = host.page.locator('#partyList li').filter({ visible: true });
    await filter.selectOption('opened');
    await expect(visibleRows).toHaveCount(1);
    await expect(row).toBeVisible();
    await filter.selectOption('notOpened');
    await expect(visibleRows).toHaveCount(1);
    await expect(otherRow).toBeVisible();
    await filter.selectOption('replied');
    await expect(visibleRows).toHaveCount(0);
    await filter.selectOption('all');
    await expect(visibleRows).toHaveCount(2);

    const form = guest.page.locator('#personalReply');
    await expect(form.locator('[name="partySize"]')).toHaveValue('3');
    await form.locator('[name="partySize"]').fill('2');
    await form.locator('[name="note"]').fill('Fără nuci');
    await form.locator('button[type="submit"]').click();
    await expect(form.getByRole('status')).toHaveText(copy.sent);
    await expect(guest.page).toHaveURL(link);
    await expect(guest.page.locator('#replyLink')).toBeHidden();
    await host.page.reload();
    await expect(row).toContainText(/Yes, 2|Da, 2/);
    await expect(row).toContainText('Fără nuci');
    await expect(row).toContainText(copy.firstOpened);
    await filter.selectOption('replied');
    await expect(visibleRows).toHaveCount(1);
    await expect(row).toBeVisible();
    await filter.selectOption('all');

    const oldLink = await newBrowser(browser);
    const expectUnavailable = async (url = link) => {
      await oldLink.page.goto(url);
      await expect(oldLink.page.getByText(copy.unavailable)).toBeVisible();
      await expect(oldLink.page.getByText('Daria', { exact: true })).toBeHidden();
      await expect(oldLink.page.getByRole('heading', { name: copy.greeting })).toBeHidden();
      await expect(oldLink.page.locator('#personalReply')).toBeHidden();
    };
    host.page.once('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: copy.revoke }).click({ timeout: 5000 });
    await expect(host.page.locator('#partyStatus')).toHaveText(copy.revoked);
    await expect(row.getByRole('button', { name: copy.copy })).toHaveCount(0);
    await expect(row.getByRole('link', { name: copy.preview })).toHaveCount(0);
    await expect(row).toContainText(/Yes, 2|Da, 2/);
    await expectUnavailable();

    host.page.once('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: copy.regenerate }).click();
    await expect(host.page.locator('#partyStatus')).toHaveText(copy.regenerated);
    await expect(row).toContainText(/Yes, 2|Da, 2/);
    const [regeneratedPreview] = await Promise.all([
      host.page.context().waitForEvent('page'),
      row.getByRole('link', { name: copy.preview }).click(),
    ]);
    await expect(regeneratedPreview.getByRole('heading', { name: copy.greeting })).toBeVisible();
    await regeneratedPreview.close();
    await row.getByRole('button', { name: copy.copy }).click();
    await expect(host.page.locator('#partyStatus')).toHaveText(copy.copied);
    const newLink = await host.page.evaluate(() => navigator.clipboard.readText());
    expect(newLink).not.toBe(link);
    await expectUnavailable();

    await guest.page.goto(newLink);
    await expect(form.locator('[name="note"]')).toHaveValue('Fără nuci');
    await form.getByRole('radio', { name: copy.decline }).check();
    await form.locator('button[type="submit"]').click();
    await expect(form.getByRole('status')).toHaveText(copy.updated);
    await host.page.reload();
    await expect(row).toContainText(/No, 0|Nu, 0/);

    guest.page.once('dialog', (dialog) => dialog.accept());
    await form.locator('button[type="button"]').click();
    await expect(form.getByRole('status')).toHaveText(copy.withdrawn);
    await expect(guest.page).toHaveURL(newLink);
    await host.page.reload();
    await expect(row).toContainText(copy.opened);
    await expect(row).toContainText(copy.firstOpened);

    host.page.once('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: copy.regenerate }).click();
    await expect(host.page.locator('#partyStatus')).toHaveText(copy.regenerated);
    await row.getByRole('button', { name: copy.copy }).click();
    await expect(host.page.locator('#partyStatus')).toHaveText(copy.copied);
    await guest.page.goto(await host.page.evaluate(() => navigator.clipboard.readText()));
    await expect(form.getByRole('status')).toHaveText(copy.noReply);
    await expectUnavailable(newLink);
    expect([...host.problems, ...guest.problems, ...oldLink.problems]).toEqual([]);
  });
}
