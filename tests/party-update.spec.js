// Checks that a host saves, changes and removes the update for every party in both languages, that the WhatsApp
// queue has one message per party in the party's language with its personal link and leaves out a revoked link, and
// that personal links and view links show the latest update.
// Run: pnpm test:browser tests/party-update.spec.js
import { expect, test } from '@playwright/test';
import { newBrowser } from './browser-setup.js';

const COPY = {
  en: {
    editor: '/editor.html?t=birthday',
    add: 'Add to guest list',
    save: 'Save update',
    remove: 'Remove update',
    saved: 'Update saved.',
    removed: 'Update removed.',
    invalid: 'Enter an update of 1 to 500 characters.',
    whatsapp: 'Send on WhatsApp',
    revoke: 'Revoke personal link',
    greeting: (name) => `Hello, ${name}!`,
    heading: 'Update from the host',
    linkPath: /\/e\/[\w-]+#p=[\w-]+\.[\w-]+$/,
  },
  ro: {
    editor: '/ro/editor.html?t=botez-porumbel',
    add: 'Adaugă pe lista de invitați',
    save: 'Salvează mesajul',
    remove: 'Șterge mesajul',
    saved: 'Mesajul a fost salvat.',
    removed: 'Mesajul a fost șters.',
    invalid: 'Introdu un mesaj de 1 până la 500 de caractere.',
    whatsapp: 'Trimite pe WhatsApp',
    revoke: 'Revocă linkul personal',
    greeting: (name) => `Bună, ${name}!`,
    heading: 'Mesaj nou de la gazdă',
    linkPath: /\/ro\/e\/[\w-]+#p=[\w-]+\.[\w-]+$/,
  },
};

for (const lang of ['en', 'ro']) {
  test(`in ${lang}, a host sends an update to every party and both party links show it`, async ({ browser }) => {
    const copy = COPY[lang];
    const otherLang = lang === 'en' ? 'ro' : 'en';
    const host = await newBrowser(browser);
    await host.page.goto(copy.editor);
    await host.page.check('input[name="mode"][value="guestList"]');
    await host.page.fill('#title', 'Daria');
    await host.page.click('#publish');
    const manage = host.page.locator('#manageLink');
    await expect(manage).toHaveValue(/manage\.html#/);
    await host.page.goto(await manage.inputValue());
    await host.page.locator('#partyName').fill('Familia Radu');
    await host.page.getByRole('button', { name: copy.add }).click();
    await expect(host.page.locator('#partyList li')).toHaveCount(1);
    await host.page.locator('#partyName').fill('Anna & Tom');
    await host.page.locator('#partyLang').selectOption(otherLang);
    await host.page.getByRole('button', { name: copy.add }).click();
    await expect(host.page.locator('#partyList li')).toHaveCount(2);

    const panel = host.page.locator('#partyUpdate');
    await expect(panel.getByRole('button', { name: copy.remove })).toBeHidden();
    await expect(host.page.locator('#updateQueue li')).toHaveCount(0);
    await host.page.locator('#updateText').fill('   ');
    await panel.getByRole('button', { name: copy.save }).click();
    await expect(host.page.locator('#updateStatus')).toHaveText(copy.invalid);

    await host.page.locator('#updateText').fill('The party starts at 18:00.');
    await panel.getByRole('button', { name: copy.save }).click();
    await expect(host.page.locator('#updateStatus')).toHaveText(copy.saved);
    const update = 'The party starts at 19:00.\nUse the side door.';
    await host.page.locator('#updateText').fill(update);
    await panel.getByRole('button', { name: copy.save }).click();
    await expect(host.page.locator('#updateStatus')).toHaveText(copy.saved);
    await host.page.reload();
    await expect(host.page.locator('#updateText')).toHaveValue(update);

    // Each party gets one message in its own language with its greeting, the update and its personal link.
    await expect(host.page.locator('#updateQueue li')).toHaveCount(2);
    const message = async (name) => {
      const href = await host.page.getByRole('link', { name: `${copy.whatsapp} · ${name}` }).getAttribute('href');
      return new URL(href).searchParams.get('text');
    };
    const local = await message('Familia Radu');
    const link = local.split('\n').at(-1);
    expect(local).toBe([copy.greeting('Familia Radu'), copy.heading, update, link].join('\n'));
    expect(link).toMatch(copy.linkPath);
    const abroad = await message('Anna & Tom');
    const otherCopy = COPY[otherLang];
    const abroadLink = abroad.split('\n').at(-1);
    expect(abroad).toBe([otherCopy.greeting('Anna & Tom'), otherCopy.heading, update, abroadLink].join('\n'));
    expect(abroadLink).toMatch(otherCopy.linkPath);

    // A revoked personal link leaves the queue, because its message would carry a link that no longer works.
    host.page.once('dialog', (dialog) => dialog.accept());
    await host.page
      .locator('#partyList li')
      .filter({ hasText: 'Anna & Tom' })
      .getByRole('button', { name: copy.revoke })
      .click();
    await expect(host.page.locator('#updateQueue li')).toHaveCount(1);
    await expect(host.page.getByRole('link', { name: `${copy.whatsapp} · Anna & Tom` })).toHaveCount(0);

    const guest = await newBrowser(browser);
    await guest.page.goto(link);
    const shown = guest.page.locator('#personalSections #partyUpdate');
    await expect(shown.getByRole('heading', { name: copy.heading })).toBeVisible();
    await expect(shown.locator('p')).toHaveText(update);
    await expect(guest.page.locator('#personalReply')).toBeVisible();
    const [previewPage] = await Promise.all([
      host.page.context().waitForEvent('page'),
      host.page
        .locator('#partyList li')
        .filter({ hasText: 'Familia Radu' })
        .getByRole('link', { name: lang === 'en' ? 'Preview as this guest' : 'Previzualizează ca acest invitat' })
        .click(),
    ]);
    await expect(previewPage.locator('#personalSections #partyUpdate p')).toHaveText(update);
    const view = previewPage.url();
    await previewPage.close();
    const friend = await newBrowser(browser);
    await friend.page.goto(view);
    await expect(friend.page.locator('#personalSections #partyUpdate p')).toHaveText(update);
    await expect(friend.page.locator('#personalReply')).toHaveCount(0);

    host.page.once('dialog', (dialog) => dialog.accept());
    await panel.getByRole('button', { name: copy.remove }).click();
    await expect(host.page.locator('#updateStatus')).toHaveText(copy.removed);
    await expect(host.page.locator('#updateText')).toHaveValue('');
    await expect(host.page.locator('#updateQueue li')).toHaveCount(0);
    await friend.page.reload();
    await expect(friend.page.getByRole('heading', { name: copy.greeting('Familia Radu') })).toBeVisible();
    await expect(friend.page.locator('#partyUpdate')).toHaveCount(0);
    expect([...host.problems, ...guest.problems, ...friend.problems]).toEqual([]);
  });
}
