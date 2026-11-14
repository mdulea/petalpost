// Fails when the landing gallery, the editor preview, the draft reload, the guest view, the calendar download, the photo
// upload, the PNG download or the link preview generator breaks in Chromium, or a page breaks the
// Content-Security-Policy.
// Run: pnpm test:browser
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { HERO_TEMPLATES, TEMPLATES } from '../js/templates.js';

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

test('the landing page shows every template', async ({ page }) => {
  const problems = watch(page);
  await page.goto('/');
  await expect(page.locator('#gallery .card')).toHaveCount(TEMPLATES.length);
  expect(problems).toEqual([]);
});

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
  const download = guest.waitForEvent('download');
  await guest.click('#addCalendar');
  expect(await readFile(await (await download).path(), 'utf8')).toContain('SUMMARY:Zoe turns 30');
  expect(await guest.evaluate(() => localStorage.length)).toBe(0);
  expect(problems).toEqual([]);
});

test('a photo upload and the PNG download work', async ({ page }) => {
  const problems = watch(page);
  await page.goto('editor.html');
  await page.setInputFiles('#photoInput', { name: 'pixel.png', mimeType: 'image/png', buffer: PIXEL });
  await expect(page.locator('#status')).toHaveText('Photo added.');
  await expect(page.locator('#previewCard .invite-photo')).toBeVisible();
  await page.waitForFunction(() => typeof htmlToImage === 'object');
  const download = page.waitForEvent('download');
  await page.click('#downloadPng');
  const png = await readFile(await (await download).path());
  expect(png.subarray(1, 4).toString()).toBe('PNG');
  expect(png.length).toBeGreaterThan(10000);
  expect(problems).toEqual([]);
});

test('the link preview generator draws the hero templates', async ({ page }) => {
  const problems = watch(page);
  await page.goto('scripts/og-card.html');
  await expect(page.locator('#fan .invite')).toHaveCount(HERO_TEMPLATES.length);
  expect(problems).toEqual([]);
});
