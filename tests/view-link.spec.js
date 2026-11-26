// Checks sharing, clipboard fallback, and the invitation shown by view links in both languages.
// Run: pnpm test:browser tests/view-link.spec.js
import { expect, test } from '@playwright/test';
import { newBrowser } from './browser-setup.js';

const COPY = {
  en: {
    editor: '/editor.html?t=birthday',
    add: 'Add party',
    copy: 'Copy personal link',
    copied: 'Personal link copied.',
    greeting: 'Hello, Familia Radu!',
    sent: 'Reply sent',
    showFriend: 'Show a friend',
    viewShared: 'View link shared.',
    viewCopied: 'View link copied.',
    regenerate: 'Regenerate personal link',
    regenerated: 'Personal link regenerated.',
    unavailable: 'This link no longer works. Ask the host for a new one.',
  },
  ro: {
    editor: '/ro/editor.html?t=botez-porumbel',
    add: 'Adaugă un grup',
    copy: 'Copiază linkul personal',
    copied: 'Linkul personal a fost copiat.',
    greeting: 'Bună, Familia Radu!',
    sent: 'Răspuns trimis',
    showFriend: 'Arată invitația unui prieten',
    viewShared: 'Linkul de vizualizare a fost trimis.',
    viewCopied: 'Linkul de vizualizare a fost copiat.',
    regenerate: 'Generează un link personal nou',
    regenerated: 'Noul link personal a fost generat.',
    unavailable: 'Acest link nu mai funcționează. Cere-i gazdei un link nou.',
  },
};

for (const lang of ['en', 'ro']) {
  test(`in ${lang}, a guest shares the invitation through a read-only view link`, async ({ browser }) => {
    const copy = COPY[lang];
    const options = { permissions: ['clipboard-read', 'clipboard-write'] };
    const host = await newBrowser(browser, options);
    await host.page.goto(copy.editor);
    await host.page.check('input[name="mode"][value="guestList"]');
    await host.page.fill('#title', 'Daria');
    await host.page.click('#publish');
    const manage = host.page.locator('#manageLink');
    await expect(manage).toHaveValue(/manage\.html#/);
    await host.page.goto(await manage.inputValue());
    await host.page.locator('#partyName').fill('Familia Radu');
    await host.page.getByRole('button', { name: copy.add }).click();
    const row = host.page.locator('#partyList li').filter({ hasText: 'Familia Radu' });
    await row.getByRole('button', { name: copy.copy }).click();
    await expect(host.page.locator('#partyStatus')).toHaveText(copy.copied);
    const link = await host.page.evaluate(() => navigator.clipboard.readText());

    const guest = await newBrowser(browser, options);
    await guest.page.addInitScript((useShareSheet) => {
      Object.defineProperty(navigator, 'share', {
        value: useShareSheet ? ({ url }) => navigator.clipboard.writeText(url) : undefined,
      });
    }, lang === 'en');
    await guest.page.goto(link);
    const form = guest.page.locator('#personalReply');
    await form.locator('[name="note"]').fill('Fără nuci');
    await form.locator('button[type="submit"]').click();
    await expect(form.getByRole('status')).toHaveText(copy.sent);

    await guest.page.getByRole('button', { name: copy.showFriend }).click();
    await expect(guest.page.getByText(lang === 'en' ? copy.viewShared : copy.viewCopied)).toBeVisible();
    const view = await guest.page.evaluate(() => navigator.clipboard.readText());
    expect(view).toMatch(/\/e\/[\w-]+#v=[\w-]+\.[\w-]+$/);
    const friend = await newBrowser(browser);
    await friend.page.goto(view);
    await expect(friend.page.getByRole('heading', { name: copy.greeting })).toBeVisible();
    await expect(friend.page.locator('#previewCard .invite-title')).toHaveText('Daria');
    await expect(friend.page.locator('#personalReply')).toHaveCount(0);
    await expect(friend.page.locator('#rsvpForm')).toBeHidden();
    await expect(friend.page.getByText('Fără nuci')).toHaveCount(0);
    await expect(friend.page.getByRole('button', { name: copy.showFriend })).toHaveCount(0);

    await friend.page.goto(link.replace('#p=', '#v='));
    await expect(friend.page.getByText(copy.unavailable)).toBeVisible();
    await expect(friend.page.locator('#previewCard')).toBeHidden();
    await expect(friend.page.getByRole('heading', { name: copy.greeting })).toHaveCount(0);

    host.page.once('dialog', (dialog) => dialog.accept());
    await row.getByRole('button', { name: copy.regenerate }).click();
    await expect(host.page.locator('#partyStatus')).toHaveText(copy.regenerated);
    await friend.page.goto(view);
    await expect(friend.page.getByText(copy.unavailable)).toBeVisible();
    await expect(friend.page.locator('#previewCard')).toBeHidden();
    await expect(friend.page.getByRole('heading', { name: copy.greeting })).toHaveCount(0);
    expect([...host.problems, ...guest.problems, ...friend.problems]).toEqual([]);
  });
}
