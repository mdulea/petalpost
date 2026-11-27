// Fails when inviting a party to a subset of the sub-events breaks in the browser, in English and Romanian. Checks:
// the host picks the sub-events of one party in its row and of every party the search shows at once; the tracker
// totals of each sub-event count only the invited parties and show the invited parties without a reply; the personal
// link and the view link show only the party's sub-events, and the guest answers only those; no page breaks the
// Content-Security-Policy or throws.
// Run: pnpm test:browser tests/party-sub-events.spec.js
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

for (const { lang, editor } of LANGS) {
  const copy = UI[lang].subEventReplies;
  const words = UI[lang].guestList;
  const totals = (name, counts) => copy.totals({ name, yes: 0, no: 0, attending: 0, unanswered: 0, ...counts });

  test(`in ${lang}, the host invites parties to some sub-events and their links show only those`, async ({
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
    await host.page.locator('#partyName').fill('Familia Radu\nIon Pop');
    await host.page.locator('#partyLang').selectOption(lang);
    await host.page.locator('#addParty button[type="submit"]').click();
    const radu = host.page.locator('#partyList > li').filter({ hasText: 'Familia Radu' });
    const ion = host.page.locator('#partyList > li').filter({ hasText: 'Ion Pop' });
    await expect(ion).toBeVisible();
    const partyTotals = host.page.locator('#partyTotals .total-line');
    await expect(partyTotals).toHaveText([totals('Civil', { pending: 2 }), totals('Church', { pending: 2 })]);

    // One party: Familia Radu goes only to the civil ceremony.
    const raduChoice = radu.getByRole('group', { name: `${copy.invitedTo} · Familia Radu` });
    await raduChoice.getByLabel('Church').uncheck();
    await raduChoice.getByRole('button', { name: copy.saveInvited }).click();
    await expect(host.page.locator('#partyStatus')).toHaveText(copy.invitedSaved);
    await expect(raduChoice.getByLabel('Church')).not.toBeChecked();
    await expect(raduChoice.getByLabel('Civil')).toBeChecked();

    // Many parties: every party the search shows, here Ion Pop, goes only to the church.
    await host.page.fill('#partySearch', 'ion');
    const bulk = host.page.getByRole('group', { name: copy.bulkInvitedTo });
    await bulk.getByLabel('Civil').uncheck();
    await bulk.getByRole('button', { name: copy.bulkSave }).click();
    await expect(host.page.locator('#partyStatus')).toHaveText(copy.bulkSaved(1));
    await host.page.fill('#partySearch', '');
    await host.page.locator('#partySearch').dispatchEvent('input');
    const ionChoice = ion.getByRole('group', { name: `${copy.invitedTo} · Ion Pop` });
    await expect(ionChoice.getByLabel('Civil')).not.toBeChecked();
    await expect(raduChoice.getByLabel('Church')).not.toBeChecked();
    await expect(partyTotals).toHaveText([totals('Civil', { pending: 1 }), totals('Church', { pending: 1 })]);

    const personal = await radu.locator('input[readonly]').first().inputValue();
    const [previewPage] = await Promise.all([
      host.page.context().waitForEvent('page'),
      radu.getByRole('link', { name: words.preview }).click(),
    ]);
    await expect(previewPage.locator('.schedule-name')).toHaveText(['Civil']);
    const preview = previewPage.url();
    await previewPage.close();
    const guest = await newBrowser(browser);
    await guest.page.goto(personal);
    const form = guest.page.locator('#personalReply');
    await expect(form.getByRole('group', { name: 'Church' })).toHaveCount(0);
    await expect(guest.page.locator('.schedule-name')).toHaveText(['Civil']);
    const answer = form.getByRole('group', { name: 'Civil' });
    await answer.getByLabel(copy.yes, { exact: true }).check();
    await answer.getByLabel(copy.people).fill('2');
    await form.locator('button[type="submit"]').click();
    await expect(form.getByRole('status')).toHaveText(UI[lang].guest.replySent);

    const viewer = await newBrowser(browser);
    await viewer.page.goto(preview);
    await expect(viewer.page.locator('.schedule-name')).toHaveText(['Civil']);

    await host.page.locator('#refreshParties').click();
    await expect(radu.locator('.sub-event-replies li')).toHaveText([
      copy.line('Civil', copy.answer({ attending: true, partySize: 2 })),
    ]);
    await expect(partyTotals).toHaveText([totals('Civil', { yes: 1, attending: 2 }), totals('Church', { pending: 1 })]);
    expect([...host.problems, ...guest.problems, ...viewer.problems]).toEqual([]);
  });
}
