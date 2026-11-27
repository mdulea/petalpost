// Checks the countdowns to the RSVP deadline and to the deletion in English and Romanian: the tracker shows the
// deadline nudge with the parties without a reply in the last 7 days before the deadline, hides the deadline countdown
// once it passes, and shows the deletion nudge in the last 3 days before the deletion and until the deletion runs; the
// personal link counts down to the deadline until it passes. The tracker and guest pages run on a Europe/Bucharest
// clock that the test moves.
// Run: pnpm test:browser tests/countdowns.spec.js
import { expect, test } from '@playwright/test';
import { newBrowser } from './browser-setup.js';

const HOUR = 60 * 60 * 1000;

const COPY = {
  en: {
    editor: '/editor.html?t=birthday',
    saveDeadline: 'Save deadline',
    deadlineSaved: 'RSVP deadline saved.',
    deadlineNudge: 'Replies close in 5 days. 1 party has not replied.',
    deletion: 'The guest list and its replies are deleted in 16 days.',
    deletionNudge: 'The guest list and its replies are deleted in 2 days. Download the guest-list CSV to keep a copy.',
    deletionDue: 'The guest list and its replies are deleted within a day. Download the guest-list CSV to keep a copy.',
    guest: 'Replies close in 5 days.',
  },
  ro: {
    editor: '/ro/editor.html?t=botez-porumbel',
    saveDeadline: 'Salvează termenul',
    deadlineSaved: 'Termenul de confirmare a fost salvat.',
    deadlineNudge: 'Confirmările se închid peste 5 zile. Încă nu a răspuns un grup.',
    deletion: 'Lista de invitați și răspunsurile ei se șterg peste 16 zile.',
    deletionNudge:
      'Lista de invitați și răspunsurile ei se șterg peste 2 zile. Descarcă lista de invitați în format CSV ca să păstrezi o copie.',
    deletionDue:
      'Lista de invitați și răspunsurile ei se șterg în cel mult o zi. Descarcă lista de invitați în format CSV ca să păstrezi o copie.',
    guest: 'Confirmările se închid peste 5 zile.',
  },
};

for (const lang of ['en', 'ro']) {
  test(`in ${lang}, the tracker nudges before the deadline and the deletion, and the guest sees the deadline countdown`, async ({
    browser,
  }) => {
    const copy = COPY[lang];
    const host = await newBrowser(browser);
    await host.page.goto(copy.editor);
    await host.page.check('input[name="mode"][value="guestList"]');
    await host.page.fill('#title', 'Daria');
    await host.page.fill('#date', '2099-06-20');
    await host.page.click('#publish');
    await expect(host.page.locator('#manageLink')).toHaveValue(/manage\.html#/);
    const manage = await host.page.locator('#manageLink').inputValue();
    await host.page.goto(manage);
    await host.page.locator('#partyName').fill('Familia Radu', { timeout: 5000 });
    await host.page.locator('#partyLang').selectOption(lang);
    await host.page.locator('#addParty button[type="submit"]').click();
    const link = await host.page
      .locator('#partyList li')
      .filter({ hasText: 'Familia Radu' })
      .locator('input[readonly]')
      .inputValue();
    await host.page.locator('#deadlineDate').fill('2099-06-10');
    await host.page.getByRole('button', { name: copy.saveDeadline }).click();
    await expect(host.page.locator('#deadlineStatus')).toHaveText(copy.deadlineSaved);

    // Five days before the deadline, at noon in Bucharest, the party has not replied.
    const tracker = await newBrowser(browser, { timezoneId: 'Europe/Bucharest' });
    await tracker.page.clock.install({ time: new Date('2099-06-05T09:00:00Z') });
    await tracker.page.goto(manage);
    const deadline = tracker.page.locator('#deadlineCountdown');
    const deletion = tracker.page.locator('#deletionCountdown');
    await expect(deadline).toHaveText(copy.deadlineNudge);
    await expect(deadline).toHaveClass('warning');
    await expect(deletion).toHaveText(copy.deletion);
    await expect(deletion).toHaveClass('hint');

    // Two days before the deletion, the deadline has passed and the tracker nudges the host to download the CSV.
    await tracker.page.clock.fastForward(14 * 24 * HOUR);
    await expect(deadline).toBeHidden();
    await expect(deletion).toHaveText(copy.deletionNudge);
    await expect(deletion).toHaveClass('warning');

    // After 23:59 on the day after the event, the nudge stays until the daily retention run deletes the list.
    await tracker.page.reload();
    await tracker.page.clock.fastForward(3 * 24 * HOUR);
    await expect(deletion).toHaveText(copy.deletionDue);
    await expect(deletion).toHaveClass('warning');

    const guest = await newBrowser(browser, { timezoneId: 'Europe/Bucharest' });
    await guest.page.clock.install({ time: new Date('2099-06-05T09:00:00Z') });
    await guest.page.goto(link);
    const left = guest.page.locator('#personalDeadlineCountdown');
    await expect(left).toHaveText(copy.guest);
    // At 23:59:30 on the deadline day in Bucharest, the countdown and reply form are still open.
    await guest.page.clock.fastForward(5 * 24 * HOUR + 11 * HOUR + 59 * 60 * 1000 + 30 * 1000);
    await expect(left).not.toHaveText('');
    await expect(guest.page.locator('#personalReply button[type="submit"]')).toBeVisible();
    // Crossing 00:00 after the deadline day locks both the banner and the reply form mid-session.
    await guest.page.clock.fastForward(60 * 1000);
    await expect(left).toHaveText('');
    await expect(guest.page.locator('#personalReply button[type="submit"]')).toBeHidden();
    await expect(guest.page.locator('#personalReply [name="partySize"]')).toBeDisabled();

    expect([...host.problems, ...tracker.problems, ...guest.problems]).toEqual([]);
  });
}
