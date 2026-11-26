// Fails when a passkey round trip breaks in Chromium against the real API of scripts/server.js. Checks: in English
// and Romanian, the host saves a passkey on the management page with a virtual authenticator; another browser whose
// authenticator holds the synced passkey uses "Find my invitations" on the home page and opens that invitation's
// management page with an access token, which shows replies and read-only passkey dates; a co-host opens the shared
// management link, saves a second passkey, and can sign in until that key is removed; both management share buttons
// need the full link and can fall back to copying it; a passkey session can read the guest list and the reminder
// queue, rename and delete parties, and requires the management link to add parties, copy personal links or open
// reminders; a cancelled sign-in stays on the home page; no page breaks the Content-Security-Policy or throws.
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

test('a co-host saves a second passkey and loses sign-in when it is removed', async ({ browser }) => {
  const host = await newBrowser(browser, { permissions: ['clipboard-read', 'clipboard-write'] });
  const cohost = await newBrowser(browser);
  const share = Promise.withResolvers();
  await host.page.exposeFunction('shareManagementLink', ({ url }) => share.resolve(url));
  await host.page.addInitScript(() =>
    Object.defineProperty(navigator, 'share', { value: window['shareManagementLink'], configurable: true }),
  );
  await addAuthenticator(host.page);
  await addAuthenticator(cohost.page);
  const title = 'Party with two hosts';
  const { manage } = await publish(host.page, title);
  await host.page.goto(new URL(manage).pathname + new URL(manage).hash);
  await host.page.locator('#savePasskey').click();
  await expect(host.page.locator('#passkeyStatus')).toHaveText(UI.en.passkey.saved);

  await host.page.getByRole('button', { name: 'Share with a co-host' }).click();
  const shared = new URL(await share.promise);
  expect(shared.hash).toBe(new URL(manage).hash);
  await host.page.bringToFront();
  await host.page.evaluate(() => Object.defineProperty(navigator, 'share', { value: undefined }));
  await host.page.getByRole('button', { name: 'Send the link to myself' }).click();
  await expect(host.page.locator('#manageStatus')).toContainText('Management link copied.');
  expect(await host.page.evaluate(() => navigator.clipboard.readText())).toBe(shared.href);
  await cohost.page.goto(shared.pathname + shared.hash);
  await cohost.page.locator('#savePasskey').click();
  await expect(cohost.page.locator('#passkeyStatus')).toHaveText(UI.en.passkey.saved);
  const dates = cohost.page.locator('#passkeyList time');
  await expect(dates).toHaveCount(2);
  for (const date of await dates.all()) {
    await expect(date).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}T/);
    await expect(date).toContainText(/\d{4}/);
  }

  for (const { page } of [host, cohost]) {
    await page.goto('/');
    await page.locator('#findInvitations').click();
    await expect(page.locator('#manageHeading')).toHaveText(title);
    await expect(page.getByRole('button', { name: 'Send the link to myself' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Share with a co-host' })).toBeDisabled();
    await expect(page.locator('#managementShareHint')).toBeVisible();
    await expect(page.locator('#managementShareHint')).toContainText('Open the full management link');
    await expect(page.locator('#passkeyList time')).toHaveCount(2);
    await expect(page.locator('#passkeyList button')).toHaveCount(0);
  }

  await host.page.goto(shared.pathname + shared.hash);
  await expect(host.page.locator('#passkeyList time')).toHaveCount(2);
  host.page.once('dialog', (dialog) => dialog.accept());
  await host.page.getByRole('button', { name: 'Remove passkey 2' }).click();
  await expect(host.page.locator('#passkeyList time')).toHaveCount(1);
  await cohost.page.goto('/');
  await cohost.page.locator('#findInvitations').click();
  await expect(cohost.page.locator('#findStatus')).toContainText('This passkey no longer opens an invitation.');
  await host.page.goto('/');
  await host.page.locator('#findInvitations').click();
  await expect(host.page.locator('#manageHeading')).toHaveText(title);
  expect([...host.problems, ...cohost.problems]).toEqual([]);
});

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
    await expect(other.page.locator('#passkeyList time')).toHaveCount(1);
    await expect(other.page.locator('#savePasskey')).toBeHidden();
    await expect(other.page.locator('#passkeyList button')).toHaveCount(0);
    expect([...host.problems, ...other.problems]).toEqual([]);
  });
}

test('a passkey session manages parties without personal link controls', async ({ browser }) => {
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
  await expect(party.getByRole('button', { name: 'Copy message' })).toBeVisible();
  await expect(party.getByRole('link', { name: 'Send on WhatsApp' })).toBeVisible();

  await page.click('#savePasskey');
  await expect(page.locator('#passkeyStatus')).toHaveText(UI.en.passkey.saved);
  await page.goto('/');
  await page.click('#findInvitations');
  await expect(page).toHaveURL(/\/manage\.html#t=/);
  await expect(party).toContainText('Not opened');
  await expect(page.locator('#addParty')).toBeHidden({ timeout: 5000 });
  await expect(party.getByRole('button', { name: 'Copy message' })).toBeHidden();
  await expect(party.getByRole('link', { name: 'Send on WhatsApp' })).toBeHidden();
  await expect(party.getByRole('link', { name: 'Preview as this guest' })).toBeHidden();
  const queue = page.getByRole('region', { name: 'Reminder queue' });
  await expect(queue.getByText('Open the management link to send reminders.')).toBeVisible();
  await expect(queue.getByRole('listitem').filter({ hasText: 'Sam' })).toBeVisible();
  await expect(queue.getByRole('link', { name: 'Remind on WhatsApp' })).toHaveCount(0);
  await expect(page.locator('#refreshParties')).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept('Daria'));
  await party.getByRole('button', { name: 'Rename' }).click({ timeout: 5000 });
  const renamed = page.locator('#partyList li').filter({ hasText: 'Daria' });
  await expect(renamed).toBeVisible();
  page.once('dialog', (dialog) => dialog.accept());
  await renamed.getByRole('button', { name: 'Delete party' }).click();
  await expect(page.locator('#noParties')).toBeVisible();
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
