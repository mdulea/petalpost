// Checks that a host shares a party's personal link message in its language, previews the party's page without
// recording an opened time, filters parties by status (not opened, opened, replied), and sees opened times, replies,
// edits and withdrawal in both languages. Also checks revoke, regenerate and the unavailable page in both languages.
// Also checks guest replies above default seats, over-default markers, accepted seats and host seat edits.
// Also checks the reminder queue, localized WhatsApp text and marks that last for the tab session.
// Run: pnpm test:browser tests/personal-link.spec.js
import { expect, test } from '@playwright/test';
import { newBrowser } from './browser-setup.js';

const COPY = {
  en: {
    editor: '/editor.html?t=birthday',
    copy: 'Copy message',
    link: /Personal link · Familia Radu/,
    whatsapp: 'Send on WhatsApp',
    reminderQueue: 'Reminder queue',
    reminder: 'Remind on WhatsApp',
    reminderUsed: 'WhatsApp opened',
    pending: (count) => `${count} ${count === 1 ? 'party' : 'parties'} without a reply`,
    reminderText: 'Please let us know if you can come.',
    greeting: (name) => `Hello, ${name}!`,
    replyHeading: 'Reply to the host',
    add: 'Add to guest list',
    preview: 'Preview as this guest',
    notOpened: 'Not opened',
    opened: 'Opened',
    noReply: 'No reply yet',
    firstOpened: 'First opened',
    lastOpened: 'Last opened',
    sent: 'Reply sent',
    updated: 'Reply updated',
    withdrawn: 'Reply withdrawn',
    decline: 'No, I cannot come',
    copied: 'Message copied.',
    linkPath: /\/e\/[\w-]+#p=[\w-]+\.[\w-]+$/,
    excludeRo: true,
    revoke: 'Revoke personal link',
    regenerate: 'Regenerate personal link',
    revoked: 'Personal link revoked.',
    regenerated: 'Personal link regenerated.',
    unavailable: 'This link no longer works. Ask the host for a new one.',
    seatsLabel: 'Reply seats',
    saveSeats: 'Save seats',
    seatsSaved: 'Seats updated.',
    overBy: (n) => `Over by ${n}`,
  },
  ro: {
    editor: '/ro/editor.html?t=botez-porumbel',
    copy: 'Copiază mesajul',
    link: /Link personal · Familia Radu/,
    whatsapp: 'Trimite pe WhatsApp',
    reminderQueue: 'Mementouri',
    reminder: 'Trimite un memento pe WhatsApp',
    reminderUsed: 'WhatsApp a fost deschis',
    pending: (count) => `${count} ${count === 1 ? 'grup' : 'grupuri'} fără răspuns`,
    reminderText: 'Te rugăm să ne spui dacă poți veni.',
    greeting: (name) => `Bună, ${name}!`,
    replyHeading: 'Confirmă participarea',
    add: 'Adaugă pe lista de invitați',
    preview: 'Previzualizează ca acest invitat',
    notOpened: 'Nedeschis',
    opened: 'Deschis',
    noReply: 'Fără răspuns',
    firstOpened: 'Deschis prima dată',
    lastOpened: 'Ultima deschidere',
    sent: 'Răspuns trimis',
    updated: 'Răspuns actualizat',
    withdrawn: 'Răspuns retras',
    decline: 'Nu pot ajunge',
    copied: 'Mesajul a fost copiat.',
    linkPath: /\/ro\/e\/[\w-]+#p=[\w-]+\.[\w-]+$/,
    excludeRo: false,
    revoke: 'Revocă linkul personal',
    regenerate: 'Generează un link personal nou',
    revoked: 'Linkul personal a fost revocat.',
    regenerated: 'Noul link personal a fost generat.',
    unavailable: 'Acest link nu mai funcționează. Cere-i gazdei un link nou.',
    seatsLabel: 'Locuri confirmate',
    saveSeats: 'Salvează locurile',
    seatsSaved: 'Locurile au fost actualizate.',
    overBy: (n) => `Cu ${n} în plus`,
  },
};

for (const lang of ['en', 'ro']) {
  test(`in ${lang}, the reminder queue tracks WhatsApp use and removes a party after its reply`, async ({
    browser,
  }) => {
    const copy = COPY[lang];
    const otherLang = lang === 'en' ? 'ro' : 'en';
    const otherCopy = COPY[otherLang];
    const host = await newBrowser(browser);
    await host.page.goto(copy.editor);
    await host.page.check('input[name="mode"][value="guestList"]');
    await host.page.click('#publish');
    const manage = host.page.locator('#manageLink');
    await expect(manage).toHaveValue(/manage\.html#/);
    await host.page.goto(await manage.inputValue());

    for (const [name, partyLang] of [
      ['Familia Radu', 'ro'],
      ['Anna & Tom', 'en'],
    ]) {
      await host.page.locator('#partyName').fill(name);
      await host.page.locator('#partyLang').selectOption(partyLang);
      await host.page.getByRole('button', { name: copy.add }).click();
      await expect(host.page.locator('#partyList li').filter({ hasText: name })).toBeVisible();
    }

    const queue = host.page.getByRole('region', { name: copy.reminderQueue });
    await expect(queue.getByText(copy.pending(2))).toBeVisible({ timeout: 5000 });
    const name = otherLang === 'ro' ? 'Familia Radu' : 'Anna & Tom';
    const pending = queue.getByRole('listitem').filter({ hasText: name });
    const button = pending.getByRole('link', { name: copy.reminder });
    const expectedLink = await host.page
      .locator('#partyList input[readonly]')
      .filter({ visible: true })
      .and(host.page.getByRole('textbox', { name: new RegExp(` · ${name}$`) }))
      .inputValue();
    await host.page.context().route('https://wa.me/**', (route) => route.fulfill({ body: 'WhatsApp' }));
    const [popup] = await Promise.all([host.page.waitForEvent('popup'), button.click()]);
    const url = new URL(popup.url());
    expect(url.origin).toBe('https://wa.me');
    expect(url.searchParams.get('text')).toBe(
      `${otherCopy.greeting(name)}\n${otherCopy.reminderText}\n${expectedLink}`,
    );
    await popup.close();
    await expect(pending.getByText(copy.reminderUsed)).toBeVisible();
    await host.page.reload();
    await expect(pending.getByText(copy.reminderUsed)).toBeVisible();
    await expect(queue.getByText(copy.reminderUsed)).toHaveCount(1);

    const guest = await newBrowser(browser);
    await guest.page.goto(expectedLink);
    const form = guest.page.locator('#personalReply');
    await form.locator('button[type="submit"]').click();
    await expect(form.getByRole('status')).toHaveText(otherCopy.sent);
    await host.page.locator('#refreshParties').click();
    await expect(queue.getByText(copy.pending(1))).toBeVisible();
    await expect(pending).toHaveCount(0);
    await expect(queue.getByRole('link', { name: copy.reminder })).toHaveCount(1);
  });

  test(`in ${lang}, a host shares a personal link in each party's language and the party manages its reply there`, async ({
    browser,
  }) => {
    const copy = COPY[lang];
    const otherLang = lang === 'en' ? 'ro' : 'en';
    const otherCopy = COPY[otherLang];
    const host = await newBrowser(browser, { permissions: ['clipboard-read', 'clipboard-write'] });
    await host.page.goto(copy.editor);
    await host.page.check('input[name="mode"][value="guestList"]');
    await host.page.fill('#title', 'Daria');
    await host.page.click('#publish');
    const manage = host.page.locator('#manageLink');
    await expect(manage).toHaveValue(/manage\.html#/);
    await host.page.goto(await manage.inputValue());

    // The language picker defaults to the invitation's language.
    await expect(host.page.locator('#partyLang')).toHaveValue(lang, { timeout: 5000 });
    await host.page.locator('#partyName').fill('Familia Radu');
    await host.page.locator('#defaultSeats').fill('3');
    await host.page.getByRole('button', { name: copy.add }).click();
    const row = host.page.locator('#partyList li').filter({ hasText: 'Familia Radu' });
    await expect(row).toContainText(copy.notOpened);

    // A second party in the opposite language gets a message and personal link in that language.
    await host.page.locator('#partyName').fill('Anna & Tom');
    await host.page.locator('#defaultSeats').fill('2');
    await host.page.locator('#partyLang').selectOption(otherLang);
    await host.page.getByRole('button', { name: copy.add }).click();
    const abroadRow = host.page.locator('#partyList li').filter({ hasText: 'Anna & Tom' });
    await expect(abroadRow).toContainText(copy.notOpened);
    await expect(host.page.locator('#partyLang')).toHaveValue(lang);
    await expect(row).not.toContainText(copy.firstOpened);
    const [previewPage] = await Promise.all([
      host.page.context().waitForEvent('page'),
      row.getByRole('link', { name: copy.preview }).click(),
    ]);
    await expect(previewPage.locator('#previewCard .invite-title')).toHaveText('Daria');
    await expect(previewPage.getByRole('heading', { name: copy.greeting('Familia Radu') })).toBeVisible();
    await expect(previewPage.locator('#personalReply')).toHaveCount(0);
    await expect(previewPage.locator('#rsvpForm')).toBeHidden();
    await previewPage.close();

    await host.page.reload();
    await expect(row).toContainText(copy.notOpened);
    await expect(row).not.toContainText(copy.firstOpened);

    await row.getByRole('button', { name: copy.copy }).click();
    await expect(host.page.locator('#partyStatus')).toHaveText(copy.copied);
    const copiedMessage = (await host.page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n');
    const whatsappHref = await row.getByRole('link', { name: copy.whatsapp }).getAttribute('href');
    expect(new URL(whatsappHref).searchParams.get('text')).toBe(copiedMessage);
    expect(copiedMessage.startsWith(`${copy.greeting('Familia Radu')}\n`)).toBe(true);
    const link = copiedMessage.split('\n').at(-1);
    expect(link).toMatch(copy.linkPath);
    if (copy.excludeRo) expect(link).not.toContain('/ro/e/');

    const guest = await newBrowser(browser);
    await guest.page.goto(link);
    await expect(guest.page.locator('html')).toHaveAttribute('lang', lang);
    await expect(guest.page.locator('#previewCard .invite-title')).toHaveText('Daria');
    await expect(guest.page.getByRole('heading', { name: copy.greeting('Familia Radu') })).toBeVisible();

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
    await expect(abroadRow).toBeVisible();
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
      await expect(oldLink.page.getByRole('heading', { name: copy.greeting('Familia Radu') })).toBeHidden();
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
    await expect(regeneratedPreview.getByRole('heading', { name: copy.greeting('Familia Radu') })).toBeVisible();
    await regeneratedPreview.close();
    await row.getByRole('button', { name: copy.copy }).click();
    await expect(host.page.locator('#partyStatus')).toHaveText(copy.copied);
    const newMessage = (await host.page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n');
    const newLink = newMessage.split('\n').at(-1);
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
    const regeneratedMessage = (await host.page.evaluate(() => navigator.clipboard.readText())).replaceAll(
      '\r\n',
      '\n',
    );
    await guest.page.goto(regeneratedMessage.split('\n').at(-1));
    await expect(form.getByRole('status')).toHaveText(copy.noReply);
    await expectUnavailable(newLink);

    // Check the abroad party's WhatsApp/copy message and personal link in the opposite language.
    await abroadRow.getByRole('button', { name: copy.copy }).click();
    await expect(host.page.locator('#partyStatus')).toHaveText(copy.copied);
    const abroadMessage = (await host.page.evaluate(() => navigator.clipboard.readText())).replaceAll('\r\n', '\n');
    const abroadWhatsapp = await abroadRow.getByRole('link', { name: copy.whatsapp }).getAttribute('href');
    expect(new URL(abroadWhatsapp).searchParams.get('text')).toBe(abroadMessage);
    expect(abroadMessage.startsWith(`${otherCopy.greeting('Anna & Tom')}\n`)).toBe(true);
    const abroadLink = abroadMessage.split('\n').at(-1);
    expect(abroadLink).toMatch(otherCopy.linkPath);
    if (otherCopy.excludeRo) expect(abroadLink).not.toContain('/ro/e/');

    const abroadGuest = await newBrowser(browser);
    await abroadGuest.page.goto(abroadLink);
    await expect(abroadGuest.page.locator('html')).toHaveAttribute('lang', otherLang);
    await expect(abroadGuest.page.getByRole('heading', { name: otherCopy.greeting('Anna & Tom') })).toBeVisible();
    await expect(abroadGuest.page.getByRole('heading', { name: otherCopy.replyHeading })).toBeVisible();
    expect([...host.problems, ...guest.problems, ...oldLink.problems, ...abroadGuest.problems]).toEqual([]);
  });

  test(`in ${lang}, a guest can reply over default up to 20, the tracker marks the difference and counts totals, and the host can edit seats`, async ({
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
    const link = await row.getByRole('textbox', { name: copy.link }).inputValue();

    const guest = await newBrowser(browser);
    await guest.page.goto(link);
    const form = guest.page.locator('#personalReply');
    await expect(form.locator('[name="partySize"]')).toHaveValue('3');

    // Above 20 is refused with a clear message naming 20.
    await form.locator('[name="partySize"]').fill('21');
    await form.locator('button[type="submit"]').click();
    await expect(form.getByRole('status')).toContainText('20');

    // Above default (3) up to 20 is accepted.
    await form.locator('[name="partySize"]').fill('5');
    await form.locator('button[type="submit"]').click();
    await expect(form.getByRole('status')).toHaveText(copy.sent);

    await host.page.reload();
    await expect(row).toContainText(copy.overBy(2));
    const acceptedSeats = host.page.locator('#partyTotals .total').first().locator('strong');
    await expect(acceptedSeats).toHaveText('5');

    // Host edits the party's seats in the tracker and the guest sees the change.
    await row.getByRole('spinbutton', { name: `${copy.seatsLabel} · Familia Radu` }).fill('6');
    await row.getByRole('button', { name: copy.saveSeats }).click();
    await expect(host.page.locator('#partyStatus')).toHaveText(copy.seatsSaved);
    await expect(row).toContainText(copy.overBy(3));
    await expect(acceptedSeats).toHaveText('6');

    await guest.page.reload();
    await expect(form.locator('[name="partySize"]')).toHaveValue('6');
    expect([...host.problems, ...guest.problems]).toEqual([]);
  });
}
