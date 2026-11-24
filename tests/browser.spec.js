// Fails when the landing gallery or its occasion filter, a content page, the Romanian editor's Moț tab and templates, the Moț page gallery, the editor preview, the draft reload, the guest view, the sample guest invitation, the calendar download, the photo
// upload and its notice, the delivery actions under the preview, the PNG download, the link preview generator or the
// Romanian language banner breaks in Chromium, or a page, including a page with structured data, breaks the Content-Security-Policy. The banner checks fail when
// it is missing for a Romanian browser on a paired English page, its link misses the paired page, it shows for an
// English browser or on a page without a pair, a close does not last across pages, a close with blocked storage breaks
// the page, or it writes a cookie, requests another origin or changes the canonical and hreflang links.
// The filter checks also fail when a category change misses its 150ms fade-out or its 200ms fade-in with an 8px rise,
// rapid clicks end on another category or leave an animation running, or filtering animates under reduced motion.
// Run: pnpm test:browser
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { ROUTE_PAIRS, canonicalPath } from '../public/js/i18n.js';
import { HERO_TEMPLATES, RO_HERO_TEMPLATES, templatesFor } from '../public/js/templates.js';
import { OCCASIONS } from '../scripts/occasions.js';
import { OCCASIONS_RO } from '../scripts/occasions-ro.js';

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

// Records each Web Animations API call on a gallery card as {category, keyframes, duration} in window.cardAnimations.
const recordCardAnimations = (page) =>
  page.addInitScript(() => {
    const record = /** @type {any} */ (window);
    const animate = Element.prototype.animate;
    record.cardAnimations = [];
    Element.prototype.animate = function (keyframes, options) {
      if (this.matches('#gallery .card')) {
        record.cardAnimations.push({
          category: /** @type {HTMLElement} */ (this).dataset.category,
          keyframes,
          duration: typeof options === 'number' ? options : options?.duration,
        });
      }
      return animate.call(this, keyframes, options);
    };
  });
const cardAnimations = (page) => page.evaluate(() => /** @type {any} */ (window).cardAnimations);
const runningGalleryAnimations = (page) =>
  page.evaluate(() => document.getElementById('gallery').getAnimations({ subtree: true }).length);
const countOf = (category) => templatesFor('en').filter((t) => t.category === category).length;

test('a category change fades the cards out over 150ms, then fades the new cards in and raises them 8px over 200ms', async ({
  page,
}) => {
  await recordCardAnimations(page);
  await page.goto('/');
  await page.click('.filter[data-filter="Wedding"]');
  await expect(page.locator('#gallery .card:visible')).toHaveCount(countOf('Wedding'));
  await expect.poll(() => runningGalleryAnimations(page)).toBe(0);
  const calls = await cardAnimations(page);
  const out = calls.filter((call) => call.duration === 150);
  const into = calls.filter((call) => call.duration === 200);
  expect(out).toHaveLength(templatesFor('en').length);
  expect(out.map((call) => call.keyframes)).toEqual(out.map(() => [{ opacity: 1 }, { opacity: 0 }]));
  expect(into.map((call) => call.category)).toEqual(into.map(() => 'Wedding'));
  expect(into).toHaveLength(countOf('Wedding'));
  expect(into[0].keyframes).toEqual([
    { opacity: 0, transform: 'translateY(8px)' },
    { opacity: 1, transform: 'none' },
  ]);
  expect(calls).toHaveLength(out.length + into.length);
});

// The clicks land in one task, before any fade finishes, so only the last category may fade in.
test('rapid category clicks end on the last category chosen with no animation left running', async ({ page }) => {
  await recordCardAnimations(page);
  await page.goto('/');
  await page.evaluate(() => {
    for (const category of ['Wedding', 'Brunch', 'All', 'Graduation', 'Birthday']) {
      /** @type {HTMLElement} */ (document.querySelector(`.filter[data-filter="${category}"]`)).click();
    }
  });
  await expect.poll(() => runningGalleryAnimations(page)).toBe(0);
  const fadedIn = (await cardAnimations(page)).filter((call) => call.duration === 200).map((call) => call.category);
  expect(fadedIn).toEqual(fadedIn.map(() => 'Birthday'));
  expect(fadedIn).toHaveLength(countOf('Birthday'));
  await expect(page.locator('#gallery .card:visible')).toHaveCount(countOf('Birthday'));
  const shown = await page
    .locator('#gallery .card:visible')
    .evaluateAll((cards) => cards.map((card) => [card.dataset.category, getComputedStyle(card).opacity]));
  expect(shown).toEqual(shown.map(() => ['Birthday', '1']));
});

test('under reduced motion a category change switches the cards without animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await recordCardAnimations(page);
  await page.goto('/');
  await page.click('.filter[data-filter="Wedding"]');
  await expect(page.locator('#gallery .card:visible')).toHaveCount(countOf('Wedding'));
  await page.click('.filter[data-filter="Brunch"]');
  await expect(page.locator('#gallery .card:visible')).toHaveCount(countOf('Brunch'));
  expect(await cardAnimations(page)).toEqual([]);
  expect(await runningGalleryAnimations(page)).toBe(0);
});

test('the Romanian landing page shows every Romanian template and filters local occasions', async ({ page }) => {
  const problems = watch(page);
  await page.goto('/ro/');
  await expect(page.locator('#gallery .card')).toHaveCount(templatesFor('ro').length);
  await page.click('.filter[data-filter="Botez"]');
  await expect(page.locator('#gallery .card:visible')).toHaveCount(4);
  await page.click('.filter[data-filter="Cununie"]');
  await expect(page.locator('#gallery .card:visible')).toHaveCount(4);
  await page.click('.filter[data-filter="Moț"]');
  await expect(page.locator('#gallery .card:visible')).toHaveCount(4);
  expect(problems).toEqual([]);
});

// The occasion pages, guides and About page load js/page.js for the icon sprite and the sample invite fit.
for (const path of [
  'birthday-invitations.html',
  'invitation-wording.html',
  'about.html',
  'ro/invitatii-botez.html',
  'ro/invitatii-cununie.html',
  'ro/invitatii-mot.html',
  'ro/text-invitatii.html',
  'ro/invitatii-digitale-sau-tiparite.html',
  'ro/despre.html',
]) {
  test(`${path} loads its icons without errors`, async ({ page }) => {
    const problems = watch(page);
    await page.goto(path);
    await expect(page.locator('#i-pen')).toHaveCount(1);
    expect(problems).toEqual([]);
  });
}

// Every page with a JSON-LD block: the home pages, every occasion page and the guides.
test('every page with structured data loads it without a Content-Security-Policy violation', async ({ page }) => {
  const problems = watch(page);
  const files = [
    ...ROUTE_PAIRS.filter((pair) => pair.key === 'home' || pair.guide).flatMap((pair) =>
      [pair.en, pair.ro].filter(Boolean),
    ),
    ...Object.values(OCCASIONS).map((o) => o.file),
    ...Object.values(OCCASIONS_RO).map((o) => o.file),
  ];
  for (const file of files) {
    await page.goto(canonicalPath(file));
    await expect(page.locator('script[type="application/ld+json"]'), file).toHaveCount(1);
  }
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

test('the Romanian editor shows the four Moț templates after the Botez tab and opens Foarfecă și șuviță', async ({
  page,
}) => {
  const problems = watch(page);
  await page.goto('/ro/editor.html?t=mot-foarfeca');
  const tabs = await page.locator('#pickerTabs .filter').evaluateAll((buttons) => buttons.map((b) => b.textContent));
  expect(tabs.indexOf('Moț')).toBe(tabs.indexOf('Botez') + 1);
  await expect(page.locator('#pickerTabs .filter[aria-pressed="true"]')).toHaveText('Moț');
  await expect(page.locator('#picker .picker-name')).toHaveText([
    'Foarfecă și șuviță',
    'Tava cu obiecte',
    'Turta',
    'Primul an',
  ]);
  await expect(page.locator('#previewCard .invite-title')).toHaveText('Moțul Sofiei');
  expect(problems).toEqual([]);
});

test('the Moț occasion page gallery shows the four Moț templates', async ({ page }) => {
  const problems = watch(page);
  await page.goto('/ro/invitatii-mot.html');
  await expect(page.locator('.gallery .card-link')).toHaveText([
    'Foarfecă și șuviță',
    'Tava cu obiecte',
    'Turta',
    'Primul an',
  ]);
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

// Paired English pages and the Romanian page each banner link opens.
const PAIRED = [
  ['/', '/ro/'],
  ['/editor.html?t=wedding', '/ro/editor.html'],
  ['/wedding-invitations.html', '/ro/invitatii-nunta.html'],
  ['/privacy.html', '/ro/confidentialitate.html'],
  ['/terms.html', '/ro/termeni.html'],
];
const BANNER_TEXT = 'Această pagină este disponibilă și în română.';

// The canonical and alternate links of the page head, which the banner must leave as the server sent them.
const headLinks = (page) =>
  page.$$eval('link[rel="canonical"], link[rel="alternate"]', (links) => links.map((l) => l.outerHTML));

test.describe('a Romanian browser', () => {
  test.use({ locale: 'ro-RO' });

  for (const [path, target] of PAIRED) {
    test(`sees the Romanian banner on ${path} and its link opens ${target}`, async ({ page, context, browser }) => {
      const problems = watch(page);
      const origins = new Set();
      page.on('request', (req) => origins.add(new URL(req.url()).origin));
      await page.goto(path);
      const banner = page.locator('.lang-banner');
      await expect(banner).toHaveText(new RegExp(BANNER_TEXT));
      await expect(banner).toHaveAttribute('lang', 'ro');
      expect(await page.evaluate(() => document.querySelector('.lang-banner').nextElementSibling.className)).toBe(
        'site-header',
      );
      expect(page.url()).toContain(path);

      const english = await (await browser.newContext({ locale: 'en-US' })).newPage();
      await english.goto(path);
      expect(await headLinks(page)).toEqual(await headLinks(english));

      await banner.getByRole('link', { name: 'Deschide în română' }).click();
      await expect(page).toHaveURL(new URL(target, page.url()).href);
      await expect(page.locator('.lang-banner')).toHaveCount(0);
      expect(await context.cookies()).toEqual([]);
      expect([...origins]).toEqual([new URL(page.url()).origin]);
      expect(problems).toEqual([]);
    });
  }

  for (const path of ['/manage.html', '/missing-page']) {
    test(`sees no banner on ${path}, which has no Romanian pair`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('.site-header')).toBeVisible();
      await expect(page.locator('.lang-banner')).toHaveCount(0);
    });
  }

  test('keeps the banner closed after a reload and on another English page', async ({ page }) => {
    const problems = watch(page);
    await page.goto('/wedding-invitations.html');
    await page.getByRole('button', { name: 'Închide' }).click();
    await expect(page.locator('.lang-banner')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.site-header')).toBeVisible();
    await expect(page.locator('.lang-banner')).toHaveCount(0);
    await page.goto('/');
    await expect(page.locator('#gallery .card').first()).toBeVisible();
    await expect(page.locator('.lang-banner')).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('closes the banner for the current page when storage is blocked', async ({ page }) => {
    await page.addInitScript(() =>
      Object.defineProperty(window, 'localStorage', {
        get() {
          throw new DOMException('Storage is blocked', 'SecurityError');
        },
      }),
    );
    const problems = watch(page);
    await page.goto('/editor.html?t=wedding');
    await page.getByRole('button', { name: 'Închide' }).click();
    await expect(page.locator('.lang-banner')).toHaveCount(0);
    await page.fill('#title', 'Ana and Luca');
    await expect(page.locator('#previewCard .invite-title')).toHaveText('Ana and Luca');
    await page.reload();
    await expect(page.locator('.lang-banner')).toBeVisible();
    expect(problems).toEqual([]);
  });
});

test('an English browser sees no Romanian banner on a paired English page', async ({ browser }) => {
  const page = await (await browser.newContext({ locale: 'en-US' })).newPage();
  for (const [path] of PAIRED) {
    await page.goto(path);
    await expect(page.locator('.site-header')).toBeVisible();
    await expect(page.locator('.lang-banner')).toHaveCount(0);
  }
});
