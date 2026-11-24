// Fails when the landing gallery or its occasion filter, a content page, the editor preview, the draft reload, the guest view, the sample guest invitation, the calendar download, the photo
// upload and its notice, the delivery actions under the preview, the PNG download or the link preview generator breaks in
// Chromium, or a page breaks the Content-Security-Policy.
// Run: pnpm test:browser
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { HERO_TEMPLATES, RO_HERO_TEMPLATES, templatesFor } from '../public/js/templates.js';

// Policy violations and uncaught errors. The Vercel analytics script only exists in production, so its 404 is not one.
function watch(page) {
  const problems = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));
  return problems;
}

// A 1x1 PNG, the smallest photo the editor accepts.
const PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

test('the landing page shows every English template', async ({ page }) => {
  const problems = watch(page);
  await page.goto('/');
  await expect(page.locator('#gallery .card')).toHaveCount(templatesFor('en').length);
  expect(problems).toEqual([]);
});

test('the landing filter shows only the chosen occasion', async ({ page }) => {
  await page.goto('/');
  await page.click('.filter[data-filter="Wedding"]');
  await expect(page.locator('#gallery .card:visible')).toHaveCount(
    templatesFor('en').filter((t) => t.category === 'Wedding').length,
  );
});

test('the Romanian landing page shows every Romanian template and filters local occasions', async ({ page }) => {
  const problems = watch(page);
  await page.goto('/ro/');
  await expect(page.locator('#gallery .card')).toHaveCount(templatesFor('ro').length);
  await page.click('.filter[data-filter="Botez"]');
  await expect(page.locator('#gallery .card:visible')).toHaveCount(4);
  await page.click('.filter[data-filter="Cununie"]');
  await expect(page.locator('#gallery .card:visible')).toHaveCount(4);
  expect(problems).toEqual([]);
});

// The occasion pages, guides and About page load js/page.js for the icon sprite and the sample invite fit.
for (const path of [
  'birthday-invitations.html',
  'invitation-wording.html',
  'when-to-send-invitations.html',
  'about.html',
  'ro/invitatii-botez.html',
  'ro/invitatii-cununie.html',
  'ro/text-invitatii.html',
  'ro/cand-sa-trimiti-invitatiile.html',
  'ro/despre.html',
]) {
  test(`${path} loads its icons without errors`, async ({ page }) => {
    const problems = watch(page);
    await page.goto(path);
    await expect(page.locator('#i-pen')).toHaveCount(1);
    expect(problems).toEqual([]);
  });
}

test('an edit shows in the preview and survives a reload', async ({ page }) => {
  const problems = watch(page);
  await page.goto('editor.html?t=wedding');
  await page.fill('#title', 'Ana and Luca');
  await expect(page.locator('#previewCard .invite-title')).toHaveText('Ana and Luca');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('petalpost:draft'))).toContain('Ana and Luca');
  await page.reload();
  await expect(page.locator('#title')).toHaveValue('Ana and Luca');
  expect(problems).toEqual([]);
});

test('a share link opens the guest view and its calendar file in another browser', async ({ page, browser }) => {
  await page.goto('editor.html?t=birthday');
  await page.fill('#title', 'Zoe turns 30');
  const link = await page.locator('#previewGuest').getAttribute('href');

  const guest = await (await browser.newContext()).newPage();
  const problems = watch(guest);
  await guest.goto(link);
  await expect(guest.locator('body')).toHaveClass(/view-mode/);
  await expect(guest.locator('h1')).toHaveText('Zoe turns 30');
  await expect(guest.locator('#sampleNotice')).toBeHidden();
  const download = guest.waitForEvent('download');
  await guest.click('#addCalendar');
  expect(await readFile(await (await download).path(), 'utf8')).toContain('SUMMARY:Zoe turns 30');
  expect(await guest.evaluate(() => localStorage.length)).toBe(0);
  expect(problems).toEqual([]);
});

// Publish and Download PNG are the only ways to send the invite, and both sit under the preview.
test('the delivery actions under the preview are Publish and Download PNG', async ({ page }) => {
  await page.goto('editor.html');
  await expect(page.locator('#share-panel button:is(#publish, #downloadPng)')).toHaveCount(2);
  await expect(page.locator('#copyLink')).toHaveCount(0);
  await expect(page.locator('#form #publish')).toHaveCount(0);
});

const PHOTO_NOTICE =
  'Photo added. It stays in this browser, so the invitation link shows the illustration. To send the photo, download the PNG.';

test('a photo upload and the PNG download work', async ({ page }) => {
  const problems = watch(page);
  await page.goto('editor.html');
  await page.setInputFiles('#photoInput', { name: 'pixel.png', mimeType: 'image/png', buffer: PIXEL });
  await expect(page.locator('#status')).toHaveText(PHOTO_NOTICE);
  await expect(page.locator('#previewCard .invite-photo')).toBeVisible();
  await page.waitForFunction(() => typeof htmlToImage === 'object');
  const download = page.waitForEvent('download');
  await page.click('#downloadPng');
  const png = await readFile(await (await download).path());
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.length).toBeGreaterThan(10000);
  expect(problems).toEqual([]);
});

test('the hero sample link opens a client-only sample guest invitation with local RSVP handling', async ({
  browser,
}) => {
  const page = await (await browser.newContext()).newPage();
  const problems = watch(page);
  const apiRequests = [];
  page.on('request', (req) => {
    if (new URL(req.url()).pathname.startsWith('/api/')) apiRequests.push(req.url());
  });

  await page.goto('/');
  await page.click('.hero .cta-row a[href="editor.html?view=1&sample=1"]');
  await expect(page.locator('body')).toHaveClass(/view-mode/);
  await expect(page.locator('#previewCard .invite')).toBeVisible();
  await expect(page.locator('#sampleNotice')).toBeVisible();
  await expect(page.locator('#addCalendar')).toBeVisible();
  await expect(page.locator('#openMap')).toBeVisible();
  await expect(page.locator('#rsvpForm')).toBeVisible();
  await expect(page.locator('#reportRow')).toBeHidden();

  const sampleTitle = await page.locator('#previewCard .invite-title').textContent();
  const download = page.waitForEvent('download');
  await page.click('#addCalendar');
  expect(await readFile(await (await download).path(), 'utf8')).toContain(`SUMMARY:${sampleTitle}`);

  await page.click('#sendReply');
  await expect(page.locator('#rsvpStatus')).toContainText('Enter your name');
  await expect(page.locator('#replySaved')).toBeHidden();

  await page.fill('#guestName', 'Alex');
  await page.fill('#partySize', '2');
  await page.click('#sendReply');
  await expect(page.locator('#rsvpStatus')).toContainText('Nothing was sent');
  await expect(page.locator('#replySaved')).toBeHidden();
  expect(await page.evaluate(() => location.hash)).toBe('');
  expect(apiRequests).toEqual([]);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  expect(problems).toEqual([]);
});

test('the link preview generator draws the hero templates in English and Romanian', async ({ page }) => {
  const problems = watch(page);
  await page.goto('scripts/og-card.html');
  await expect(page.locator('#fan .invite')).toHaveCount(HERO_TEMPLATES.length);
  await page.goto('scripts/og-card.html?lang=ro');
  await expect(page.locator('#fan .invite')).toHaveCount(RO_HERO_TEMPLATES.length);
  await expect(page.locator('#card h1')).toContainText('Ziua ta');
  expect(problems).toEqual([]);
});

test('the Romanian editor uses Romanian samples, 24-hour times and isolated draft storage', async ({ page }) => {
  const problems = watch(page);
  await page.goto('/ro/editor.html?t=botez-porumbel');
  await expect(page.locator('#previewCard .invite-title')).toHaveText('Botezul lui Matei');
  await expect(page.locator('#previewCard .invite-when')).toContainText('ora 11:00');
  await page.fill('#title', 'Botezul lui Ștefan');
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('petalpost:ro:draft')))
    .toContain('Botezul lui Ștefan');
  expect(await page.evaluate(() => localStorage.getItem('petalpost:draft'))).toBeNull();
  await page.reload();
  await expect(page.locator('#title')).toHaveValue('Botezul lui Ștefan');
  expect(problems).toEqual([]);
});
