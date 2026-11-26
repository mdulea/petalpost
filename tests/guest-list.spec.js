// Fails when the invitation modes break in Chromium against the real API of scripts/server.js, in English and
// Romanian. Checks: the open mode is the default choice; after the first publish the mode choice locks; the
// invitation link of a guest-list invitation shows the invitation with a notice and no reply form, and its tracker
// shows the invitation, an empty guest list and a note that the link takes no replies, with no replies section; the
// invitation link of an open invitation keeps the reply form, and its tracker keeps the replies section without a
// guest list; the editor refuses to publish a guest-list invitation without a date, and after retention deletes a
// past guest-list invitation the tracker, personal link and public invitation link show "This invitation has ended"
// without event details, including when the host submits a party from an already open tracker; switching a published
// open invitation to the guest-list mode keeps its link and earlier replies under "Replies without a personal link"
// and in the totals, stops taking public replies, lets the host attach a reply to a party so its personal link shows
// it, and makes the old reply edit link show the unavailable message; no page breaks the Content-Security-Policy or
// throws.
// The tracker also pastes, searches, filters, exports, renames and deletes parties in both languages.
// A maximum-length paste fills the list, and the page refuses an extra party.
// A retry after a lost batch response keeps the same names, seats and language and creates no duplicates.
// Each test uses its own browser contexts for the host and every guest, so no test shares storage with another.
// Run: pnpm test:browser tests/guest-list.spec.js
import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { newBrowser } from './browser-setup.js';

const COPY = {
  en: {
    editor: '/editor.html?t=birthday',
    title: 'Zoe turns 30',
    notice: 'The host takes replies only through the personal link sent to each guest. This link shows the invitation.',
    emptyGuestList: 'No parties on the guest list yet.',
    noReplies: 'This link shows the invitation without a reply form. Guests reply only through their personal links.',
    add: 'Add to guest list',
    csv: 'Download guest-list CSV',
    rename: 'Rename',
    remove: 'Delete party',
    totals: ['2 accepted seats', '1 declined party', '1 party without a reply'],
    csvLines: [
      '\ufeffName,Status,Seats,Attending,Note',
      'Ana,Replied,2,Yes,Fără nuci',
      'Daria,Replied,0,No,',
      'Victor,No reply yet,3,,',
    ],
    dateRequired: 'Add an event date before publishing a guest-list invitation.',
    endedHeading: 'This invitation has ended',
    endedMessage: 'This invitation has ended.',
    switchButton: 'Switch to guest-list mode',
    unattachedHeading: 'Replies without a personal link',
    attach: 'Attach',
    editLinkEnded: 'This link no longer works. Use the personal link the host sent you to view or change your reply.',
  },
  ro: {
    editor: '/ro/editor.html?t=botez-porumbel',
    title: 'Botezul lui Matei',
    notice: 'Gazda primește confirmări doar prin linkul personal trimis fiecărui invitat. Acest link arată invitația.',
    emptyGuestList: 'Încă nu există invitați pe listă.',
    noReplies:
      'Acest link arată invitația fără formularul de confirmare. Invitații confirmă doar prin linkurile personale.',
    add: 'Adaugă pe lista de invitați',
    csv: 'Descarcă lista de invitați în format CSV',
    rename: 'Redenumește',
    remove: 'Șterge grupul',
    totals: ['2 locuri confirmate', '1 grup a refuzat', '1 grup fără răspuns'],
    csvLines: [
      '\ufeffNume;Stare;Locuri;Participă;Notă',
      'Ana;A răspuns;2;Da;Fără nuci',
      'Daria;A răspuns;0;Nu;',
      'Victor;Fără răspuns;3;;',
    ],
    dateRequired: 'Adaugă data evenimentului înainte de a publica o invitație cu listă de invitați.',
    endedHeading: 'Această invitație s-a încheiat',
    endedMessage: 'Această invitație s-a încheiat.',
    switchButton: 'Treci la modul listă de invitați',
    unattachedHeading: 'Răspunsuri fără link personal',
    attach: 'Asociază',
    editLinkEnded:
      'Acest link nu mai funcționează. Folosește linkul personal trimis de gazdă pentru a vedea sau modifica răspunsul.',
  },
};

// Publishes the invitation in the mode from the editor in lang and returns the links the editor shows. The open
// mode needs no click, because it is the default.
async function publishIn(page, lang, mode) {
  const copy = COPY[lang];
  await page.goto(copy.editor);
  await expect(page.locator('input[name="mode"]:checked')).toHaveValue('open');
  if (mode === 'guestList') await page.check('input[name="mode"][value="guestList"]');
  await page.fill('#title', copy.title);
  await page.click('#publish');
  await expect(page.locator('#eventLink')).toHaveValue(/\/e\/[A-Za-z0-9_-]{22}$/);
  await expect(page.locator('input[name="mode"]:checked')).toHaveValue(mode);
  for (const input of await page.locator('input[name="mode"]').all()) await expect(input).toBeDisabled();
  return {
    invitation: await page.locator('#eventLink').inputValue(),
    manage: await page.locator('#manageLink').inputValue(),
  };
}

for (const lang of ['en', 'ro']) {
  const copy = COPY[lang];

  test(`in ${lang}, a guest-list invitation shows no reply form and its tracker shows an empty guest list`, async ({
    browser,
  }) => {
    const host = await newBrowser(browser);
    const { invitation, manage } = await publishIn(host.page, lang, 'guestList');

    const guest = await newBrowser(browser);
    await guest.page.goto(invitation);
    await expect(guest.page.locator('#previewCard .invite-title')).toHaveText(copy.title);
    await expect(guest.page.locator('#guestListNotice')).toHaveText(copy.notice);
    await expect(guest.page.locator('#rsvpForm')).toBeHidden();

    await host.page.goto(manage);
    await expect(host.page.locator('#managePreview .invite-title')).toHaveText(copy.title);
    await expect(host.page.locator('#guestList')).toContainText(copy.emptyGuestList);
    await expect(host.page.locator('#eventLinkNoReplies')).toHaveText(copy.noReplies);
    await expect(host.page.locator('#eventLink')).toHaveValue(invitation);
    await expect(host.page.locator('#replies')).toBeHidden();
    await expect(host.page.locator('#deleteInvitation')).toBeVisible();
    expect([...host.problems, ...guest.problems]).toEqual([]);
  });

  test(`in ${lang}, an open invitation keeps the reply form and its tracker keeps the replies`, async ({ browser }) => {
    const host = await newBrowser(browser);
    const { invitation, manage } = await publishIn(host.page, lang, 'open');

    const guest = await newBrowser(browser);
    await guest.page.goto(invitation);
    await expect(guest.page.locator('#rsvpForm')).toBeVisible();
    await expect(guest.page.locator('#guestListNotice')).toBeHidden();

    await host.page.goto(manage);
    await expect(host.page.locator('#replies')).toBeVisible();
    await expect(host.page.locator('#noReplies')).toBeVisible();
    await expect(host.page.locator('#guestList')).toBeHidden();
    await expect(host.page.locator('#eventLinkNoReplies')).toBeHidden();
    await expect(host.page.locator('#eventLink')).toHaveValue(invitation);
    expect([...host.problems, ...guest.problems]).toEqual([]);
  });

  test(`in ${lang}, the tracker pastes, searches, filters and exports the guest list`, async ({ browser }) => {
    const host = await newBrowser(browser);
    const { page } = host;
    const { manage } = await publishIn(page, lang, 'guestList');
    await page.goto(manage);
    await page.locator('#partyName').fill(' Ana \n\nDaria\n Victor ');
    await page.locator('#defaultSeats').fill('3');
    await page.getByRole('button', { name: copy.add }).click();
    const rows = page.locator('#partyList > li');
    await expect(rows).toHaveCount(3);

    for (const name of ['Ana', 'Daria']) {
      const row = rows.filter({ hasText: name });
      const guest = await newBrowser(browser);
      await guest.page.goto(await row.locator('input[readonly]').inputValue());
      const form = guest.page.locator('#personalReply');
      if (name === 'Ana') {
        await form.locator('[name="partySize"]').fill('2');
        await form.locator('[name="note"]').fill('Fără nuci');
      } else {
        await form.getByRole('radio').last().check();
      }
      await form.locator('button[type="submit"]').click();
      await expect(form.getByRole('status')).toHaveText(/Reply sent|Răspuns trimis/);
    }

    await page.locator('#refreshParties').click();
    await expect(page.locator('#partyTotals li')).toHaveText(copy.totals);
    await page.locator('#partySearch').fill('i');
    await expect(rows.filter({ visible: true })).toHaveCount(2);
    await expect(rows.filter({ hasText: 'Daria' })).toBeVisible();
    await expect(rows.filter({ hasText: 'Victor' })).toBeVisible();
    await page.locator('#partyFilter').selectOption('replied');
    await expect(rows.filter({ visible: true }).locator('strong')).toHaveText(['Daria']);
    await page.locator('#partyFilter').selectOption('pending');
    await expect(rows.filter({ visible: true }).locator('strong')).toHaveText(['Victor']);
    await expect(page.locator('#partyTotals li')).toHaveText(copy.totals);
    const downloadReady = page.waitForEvent('download');
    await page.getByRole('button', { name: copy.csv }).click();
    const download = await downloadReady;
    const lines = (await readFile(await download.path(), 'utf8')).split('\r\n');
    expect([lines[0], ...lines.slice(1, -1).sort()]).toEqual(copy.csvLines);

    const victor = rows.filter({ hasText: 'Victor' });
    page.once('dialog', (dialog) => dialog.accept('Violeta'));
    await victor.getByRole('button', { name: copy.rename }).click();
    const violeta = rows.filter({ hasText: 'Violeta' });
    await expect(violeta).toBeVisible();
    await page.locator('#partyFilter').selectOption('replied');
    page.once('dialog', (dialog) => dialog.accept());
    await rows.filter({ hasText: 'Daria' }).getByRole('button', { name: copy.remove }).click();
    await expect(rows).toHaveCount(2);
    expect(host.problems).toEqual([]);
  });

  test(`in ${lang}, a guest-list invitation needs a date and shows ended on every link after retention`, async ({
    browser,
  }) => {
    const host = await newBrowser(browser);
    await host.page.goto(copy.editor);
    await host.page.check('input[name="mode"][value="guestList"]');
    await host.page.fill('#title', copy.title);
    await host.page.fill('#date', '');
    await host.page.click('#publish');
    await expect(host.page.locator('#publishStatus')).toHaveText(copy.dateRequired);
    await expect(host.page.locator('#date')).toBeFocused();
    await expect(host.page.locator('#published')).toBeHidden();

    await host.page.fill('#date', '2020-01-01');
    await host.page.click('#publish');
    await expect(host.page.locator('#eventLink')).toHaveValue(/\/e\/[A-Za-z0-9_-]{22}$/);
    const invitation = await host.page.locator('#eventLink').inputValue();
    const manage = await host.page.locator('#manageLink').inputValue();

    await host.page.goto(manage);
    await host.page.locator('#partyName').fill('Familia Radu');
    await host.page.locator('#defaultSeats').fill('2');
    await host.page.getByRole('button', { name: copy.add }).click();
    const row = host.page.locator('#partyList li').filter({ hasText: 'Familia Radu' });
    const personal = await row.locator('input[readonly]').inputValue();

    const response = await host.page.request.get('/api/retention');
    expect(response.status()).toBe(200);

    await host.page.locator('#partyName').fill('Another party');
    await host.page.locator('#defaultSeats').fill('2');
    await host.page.getByRole('button', { name: copy.add }).click();
    await expect(host.page.locator('#manageHeading')).toHaveText(copy.endedHeading);
    await expect(host.page.locator('#manageStatus')).toHaveText(copy.endedMessage);
    await expect(host.page.locator('#manageContent')).toBeHidden();

    await host.page.reload();
    await expect(host.page.locator('#manageHeading')).toHaveText(copy.endedHeading);
    await expect(host.page.locator('#manageStatus')).toHaveText(copy.endedMessage);
    await expect(host.page.locator('#manageContent')).toBeHidden();

    const guest = await newBrowser(browser);
    await guest.page.goto(invitation);
    await expect(guest.page.locator('.editor-head h1')).toHaveText(copy.endedHeading);
    await expect(guest.page.locator('#status')).toHaveText(copy.endedMessage);
    await expect(guest.page.locator('#previewCard')).toBeHidden();
    await expect(guest.page.getByText(copy.title)).toBeHidden();

    const invited = await newBrowser(browser);
    await invited.page.goto(personal);
    await expect(invited.page.locator('.editor-head h1')).toHaveText(copy.endedHeading);
    await expect(invited.page.locator('#status')).toHaveText(copy.endedMessage);
    await expect(invited.page.locator('#previewCard')).toBeHidden();
    await expect(invited.page.locator('#personalSections')).toBeHidden();
    await expect(invited.page.getByText('Familia Radu')).toBeHidden();
    expect([...host.problems, ...guest.problems, ...invited.problems]).toEqual([]);
  });

  test(`in ${lang}, a host switches an open invitation to guest-list mode and attaches an earlier reply`, async ({
    browser,
  }) => {
    const host = await newBrowser(browser);
    const { invitation, manage } = await publishIn(host.page, lang, 'open');

    const guest = await newBrowser(browser);
    await guest.page.goto(invitation);
    await guest.page.fill('#guestName', 'Sam');
    await guest.page.check('input[name="attending"][value="yes"]');
    await guest.page.fill('#partySize', '2');
    await guest.page.fill('#guestNote', 'Fără nuci');
    await guest.page.click('#sendReply');
    await expect(guest.page.locator('#replyLink')).toHaveValue(/#r=[\w-]+\.[\w-]+$/);
    const editLink = await guest.page.locator('#replyLink').inputValue();

    await host.page.goto(manage);
    await expect(host.page.locator('#responseList')).toContainText('Sam');
    host.page.once('dialog', (dialog) => dialog.accept());
    await host.page.getByRole('button', { name: copy.switchButton }).click();

    await expect(host.page.locator('#guestList')).toBeVisible();
    await expect(host.page.locator('#replies')).toBeHidden();
    await expect(host.page.locator('#eventLink')).toHaveValue(invitation);
    await expect(host.page.locator('#eventLinkNoReplies')).toHaveText(copy.noReplies);
    await expect(host.page.locator('#partyTotals li').first()).toHaveText(copy.totals[0]);
    await expect(host.page.locator('#h-unattached-replies')).toHaveText(copy.unattachedHeading);
    await expect(host.page.locator('#unattachedList')).toContainText('Sam');
    await expect(host.page.locator('#unattachedList')).toContainText('Fără nuci');

    const otherGuest = await newBrowser(browser);
    await otherGuest.page.goto(invitation);
    await expect(otherGuest.page.locator('#guestListNotice')).toHaveText(copy.notice);
    await expect(otherGuest.page.locator('#rsvpForm')).toBeHidden();

    await host.page.fill('#partyName', 'Familia Sam');
    await host.page.fill('#defaultSeats', '1');
    await host.page.getByRole('button', { name: copy.add }).click();
    const partyRow = host.page.locator('#partyList li').filter({ hasText: 'Familia Sam' });
    await expect(partyRow).toBeVisible();

    const unattachedRow = host.page.locator('#unattachedList li').filter({ hasText: 'Sam' });
    await unattachedRow.getByRole('button', { name: copy.attach }).click();
    await expect(host.page.locator('#unattachedReplies')).toBeHidden();
    await expect(host.page.locator('#partyTotals li').first()).toHaveText(copy.totals[0]);
    await expect(partyRow).toContainText(/Yes, 2|Da, 2/);
    await expect(partyRow).toContainText('Fără nuci');

    const personalLink = await partyRow.locator('input[readonly]').inputValue();
    await guest.page.goto(personalLink);
    await expect(guest.page.locator('#personalReply [name="partySize"]')).toHaveValue('2');
    await expect(guest.page.locator('#personalReply [name="note"]')).toHaveValue('Fără nuci');

    await otherGuest.page.goto(editLink);
    await expect(otherGuest.page.locator('#guestListNotice')).toHaveText(copy.editLinkEnded);
    await expect(otherGuest.page.locator('#rsvpForm')).toBeHidden();
    expect([...host.problems, ...guest.problems, ...otherGuest.problems]).toEqual([]);
  });
}

test('the tracker fills a list with 300 maximum-length names and refuses the 301st', async ({ browser }) => {
  const { page } = await newBrowser(browser);
  const { manage } = await publishIn(page, 'en', 'guestList');
  await page.goto(manage);
  const names = Array.from({ length: 300 }, (_, i) => String(i).padStart(3, '0') + '🎉'.repeat(77));
  await page.locator('#partyName').fill(names.join('\n'));
  await page.getByRole('button', { name: COPY.en.add }).click();
  await expect(page.locator('#partyList > li')).toHaveCount(300);
  await page.locator('#partyName').fill('One more');
  await page.getByRole('button', { name: COPY.en.add }).click();
  await expect(page.locator('#partyStatus')).toHaveText('The guest list can have up to 300 parties.');
});

test('a lost batch response retries the same names, default seats and language', async ({ browser }) => {
  const { page } = await newBrowser(browser);
  const { manage } = await publishIn(page, 'en', 'guestList');
  await page.goto(manage);
  await page.route(
    '**/api/events/*/parties',
    async (route) => {
      await route.fetch();
      await route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"Lost."}' });
    },
    { times: 1 },
  );
  const names = Array.from({ length: 30 }, (_, i) => String(i).padStart(3, '0') + '🎉'.repeat(77));
  await page.locator('#partyName').fill(names.join('\n'));
  await page.locator('#defaultSeats').fill('3');
  const language = page.locator('#partyLang');
  await language.selectOption('ro');
  const add = page.getByRole('button', { name: COPY.en.add });
  await add.click();
  await expect(page.locator('#partyStatus')).toContainText('Lost.');
  await expect(page.locator('#partyName')).not.toBeEditable();
  await expect(page.locator('#defaultSeats')).not.toBeEditable();
  await expect(language).toBeDisabled();
  await add.click();
  const rows = page.locator('#partyList > li');
  await expect(rows).toHaveCount(30);
  await expect(rows.filter({ hasText: 'Default seats: 3' })).toHaveCount(30);
  await expect(rows.filter({ hasText: 'Romanian' })).toHaveCount(30);
  await expect(page.locator('#partyName')).toBeEditable();
  await expect(language).toBeEnabled();
  await expect(language).toHaveValue('en');
});
