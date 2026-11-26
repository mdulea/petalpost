// Fails when a passkey round trip breaks in Chromium against the real API of scripts/server.js. Checks: in English
// and Romanian, the host saves a passkey on the management page with a virtual authenticator; another browser whose
// authenticator holds the synced passkey uses "Find my invitations" on the home page and opens that invitation's
// management page with an access token, which shows the replies and no passkey panel; a cancelled sign-in shows its
// message and stays on the home page; a passkey session can read the guest list and requires the management link
// to add parties or copy personal links; no page breaks the Content-Security-Policy or throws.
// Run: pnpm test:browser tests/passkey.spec.js
import { expect, test } from '@playwright/test';
import { UI } from '../public/js/i18n.js';
import { newBrowser, publish } from './browser-setup.js';

// A Chromium virtual platform authenticator with user verification, which answers without a prompt.
async function addAuthenticator(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return { cdp, authenticatorId };
}

for (const lang of ['en', 'ro']) {
  test(`a passkey saved on the management page opens it on another device in ${lang}`, async ({ browser }) => {
    const copy = UI[lang].passkey;
    const host = await newBrowser(browser);
    const title = `Passkey party ${lang}`;
    const { manage } = await publish(host.page, title);
    const managePath = new URL(manage).pathname.replace(/^\//, lang === 'ro' ? 'ro/' : '');
    const hostKey = await addAuthenticator(host.page);
    await host.page.goto(managePath + new URL(manage).hash);
    await expect(host.page.locator('#manageHeading')).toHaveText(title);
    await host.page.click('#savePasskey');
    await expect(host.page.locator('#passkeyStatus')).toHaveText(copy.saved);
    const { credentials } = await hostKey.cdp.send('WebAuthn.getCredentials', {
      authenticatorId: hostKey.authenticatorId,
    });
    expect(credentials).toHaveLength(1);

    const other = await newBrowser(browser);
    const otherKey = await addAuthenticator(other.page);
    await otherKey.cdp.send('WebAuthn.addCredential', {
      authenticatorId: otherKey.authenticatorId,
      credential: credentials[0],
    });
    await other.page.goto(lang === 'ro' ? 'ro/' : '/');
    await other.page.click('#findInvitations');
    await expect(other.page).toHaveURL(
      new RegExp(`/${lang === 'ro' ? 'ro/' : ''}manage\\.html#t=[A-Za-z0-9_-]{22}\\.[A-Za-z0-9_-]{43}$`),
    );
    await expect(other.page.locator('#manageHeading')).toHaveText(title);
    await expect(other.page.locator('#noReplies')).toBeVisible();
    await expect(other.page.locator('#passkeyPanel')).toBeHidden();
    expect([...host.problems, ...other.problems]).toEqual([]);
  });
}

test('a passkey session shows the guest list without personal link controls', async ({ browser }) => {
  const { page, problems } = await newBrowser(browser);
  await addAuthenticator(page);
  await page.goto('/editor.html?t=birthday');
  await page.check('input[name="mode"][value="guestList"]');
  await page.fill('#title', 'Passkey guest list');
  await page.click('#publish');
  const manageLink = page.locator('#manageLink');
  await expect(manageLink).toHaveValue(/manage\.html#/);
  await page.goto(await manageLink.inputValue());
  await page.fill('#partyName', 'Sam');
  await page.click('#addParty button[type="submit"]');
  const party = page.locator('#partyList li').filter({ hasText: 'Sam' });
  await expect(party.getByRole('button', { name: 'Copy personal link' })).toBeVisible();

  await page.click('#savePasskey');
  await expect(page.locator('#passkeyStatus')).toHaveText(UI.en.passkey.saved);
  await page.goto('/');
  await page.click('#findInvitations');
  await expect(page).toHaveURL(/\/manage\.html#t=/);
  await expect(party).toContainText('No reply yet');
  await expect(page.locator('#addParty')).toBeHidden({ timeout: 5000 });
  await expect(party.getByRole('button', { name: 'Copy personal link' })).toBeHidden();
  await expect(page.locator('#refreshParties')).toBeVisible();
  expect(problems).toEqual([]);
});

test('a sign-in without a passkey shows its message and stays on the home page', async ({ browser }) => {
  const { page, problems } = await newBrowser(browser);
  await addAuthenticator(page);
  await page.goto('/');
  await page.click('#findInvitations');
  await expect(page.locator('#findStatus')).toHaveText(UI.en.passkey.cancelled);
  await expect(page).toHaveURL(/\/$/);
  expect(problems).toEqual([]);
});
