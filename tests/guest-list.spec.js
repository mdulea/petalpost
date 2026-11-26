// Fails when the invitation modes break in Chromium against the real API of scripts/server.js, in English and
// Romanian. Checks: the open mode is the default choice; after the first publish the mode choice locks; the
// invitation link of a guest-list invitation shows the invitation with a notice and no reply form, and its tracker
// shows the invitation, an empty guest list and a note that the link takes no replies, with no replies section; the
// invitation link of an open invitation keeps the reply form, and its tracker keeps the replies section without a
// guest list; no page breaks the Content-Security-Policy or throws.
// Each test uses its own browser contexts for the host and every guest, so no test shares storage with another.
// Run: pnpm test:browser tests/guest-list.spec.js
import { expect, test } from '@playwright/test';
import { newBrowser } from './browser-setup.js';

const COPY = {
  en: {
    editor: '/editor.html?t=birthday',
    title: 'Zoe turns 30',
    notice: 'The host takes replies only through the personal link sent to each guest. This link shows the invitation.',
    emptyGuestList: 'No parties on the guest list yet.',
    noReplies: 'This link shows the invitation without a reply form. Guests reply only through their personal links.',
  },
  ro: {
    editor: '/ro/editor.html?t=botez-porumbel',
    title: 'Botezul lui Matei',
    notice: 'Gazda primește confirmări doar prin linkul personal trimis fiecărui invitat. Acest link arată invitația.',
    emptyGuestList: 'Încă nu există invitați pe listă.',
    noReplies:
      'Acest link arată invitația fără formularul de confirmare. Invitații confirmă doar prin linkurile personale.',
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
}
