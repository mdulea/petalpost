// Checks that a host can set, change and clear an RSVP deadline in the tracker, guests can reply before it, the
// personal link shows the reply read-only with a closed message after it, the host can still edit the reply after
// the deadline, and clearing the deadline reopens guest replies, in English and Romanian.
// Run: pnpm test:browser tests/rsvp-deadline.spec.js
import { expect, test } from '@playwright/test';
import { newBrowser } from './browser-setup.js';

const COPY = {
  en: {
    editor: '/editor.html?t=birthday',
    saveDeadline: 'Save deadline',
    clearDeadline: 'Clear deadline',
    deadlineSaved: 'RSVP deadline saved.',
    deadlineCleared: 'RSVP deadline cleared. Replies are open.',
    sent: 'Reply sent',
    updated: 'Reply updated',
    closed: /Replies are closed/,
    editReply: 'Edit reply',
    saveReply: 'Save reply',
    replySaved: 'Reply saved.',
  },
  ro: {
    editor: '/ro/editor.html?t=botez-porumbel',
    saveDeadline: 'Salvează termenul',
    clearDeadline: 'Șterge termenul',
    deadlineSaved: 'Termenul de confirmare a fost salvat.',
    deadlineCleared: 'Termenul de confirmare a fost șters. Confirmările sunt deschise.',
    sent: 'Răspuns trimis',
    updated: 'Răspuns actualizat',
    closed: /Confirmările sunt închise/,
    editReply: 'Modifică răspunsul',
    saveReply: 'Salvează răspunsul',
    replySaved: 'Răspunsul a fost salvat.',
  },
};

for (const lang of ['en', 'ro']) {
  test(`in ${lang}, replies work before the deadline, show read-only after it, and host edits still work`, async ({
    browser,
  }) => {
    const copy = COPY[lang];
    const host = await newBrowser(browser);
    await host.page.goto(copy.editor);
    await host.page.check('input[name="mode"][value="guestList"]');
    await host.page.fill('#title', 'Daria');
    await host.page.click('#publish');
    const manage = host.page.locator('#manageLink');
    await expect(manage).toHaveValue(/manage\.html#/);
    await host.page.goto(await manage.inputValue());

    // Add a party and read its personal link from the tracker.
    await host.page.locator('#partyName').fill('Familia Radu', { timeout: 5000 });
    await host.page.locator('#defaultSeats').fill('3');
    await host.page.locator('#partyLang').selectOption(lang);
    await host.page.locator('#addParty button[type="submit"]').click();
    const row = host.page.locator('#partyList li').filter({ hasText: 'Familia Radu' });
    const link = await row.locator('input[readonly]').inputValue();

    // Set a future RSVP deadline: guest can reply and edit normally.
    await host.page.locator('#deadlineDate').fill('2099-12-31');
    await host.page.getByRole('button', { name: copy.saveDeadline }).click();
    await expect(host.page.locator('#deadlineStatus')).toHaveText(copy.deadlineSaved);

    const guest = await newBrowser(browser);
    await guest.page.goto(link);
    await expect(guest.page.locator('#personalDeadline')).toBeVisible();
    const form = guest.page.locator('#personalReply');
    await form.locator('[name="partySize"]').fill('5');
    await form.locator('[name="note"]').fill('Fără nuci');
    await form.locator('button[type="submit"]').click();
    await expect(form.getByRole('status')).toHaveText(copy.sent);

    // Change the deadline to a past date: personal link shows the reply read-only with a closed message.
    await host.page.locator('#deadlineDate').fill('2020-01-01');
    await host.page.getByRole('button', { name: copy.saveDeadline }).click();
    await expect(host.page.locator('#deadlineStatus')).toHaveText(copy.deadlineSaved);
    await expect(host.page.locator('#deadlineSummary')).toHaveText(copy.closed);

    await guest.page.reload();
    await expect(guest.page.locator('#personalDeadline')).toHaveText(copy.closed);
    await expect(form.locator('[name="partySize"]')).toBeDisabled();
    await expect(form.locator('[name="note"]')).toBeDisabled();
    await expect(form.locator('button[type="submit"]')).toBeHidden();
    await expect(form.locator('button[type="button"]')).toBeHidden();
    await expect(form.locator('[name="partySize"]')).toHaveValue('5');
    await expect(form.locator('[name="note"]')).toHaveValue('Fără nuci');

    // Host can still edit the party's reply in the tracker after the deadline.
    await row.getByRole('button', { name: copy.editReply }).click();
    const editForm = row.locator('form').filter({ has: host.page.getByRole('button', { name: copy.saveReply }) });
    await editForm.locator('[name="partySize"]').fill('4');
    await editForm.locator('[name="note"]').fill('Actualizat telefonic');
    await editForm.getByRole('button', { name: copy.saveReply }).click();
    await expect(host.page.locator('#partyStatus')).toHaveText(copy.replySaved);
    await expect(row).toContainText(/Yes, 4|Da, 4/);
    await expect(row).toContainText('Actualizat telefonic');

    // Guest sees the host's updated reply read-only.
    await guest.page.reload();
    await expect(form.locator('[name="partySize"]')).toHaveValue('4');
    await expect(form.locator('[name="note"]')).toHaveValue('Actualizat telefonic');
    await expect(form.locator('[name="partySize"]')).toBeDisabled();

    // Clearing the deadline reopens guest replies.
    await host.page.getByRole('button', { name: copy.clearDeadline }).click();
    await expect(host.page.locator('#deadlineStatus')).toHaveText(copy.deadlineCleared);
    await guest.page.reload();
    await expect(guest.page.locator('#personalDeadline')).toHaveCount(0);
    await expect(form.locator('[name="partySize"]')).toBeEnabled();
    await form.locator('[name="partySize"]').fill('3');
    await form.locator('button[type="submit"]').click();
    await expect(form.getByRole('status')).toHaveText(copy.updated);

    expect([...host.problems, ...guest.problems]).toEqual([]);
  });
}
