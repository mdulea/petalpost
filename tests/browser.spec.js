// Fails when the landing gallery or its occasion filter, a content page, the Romanian editor's Moț tab and templates, the Moț page gallery, the editor preview, the draft reload, the guest view, the sample guest invitation, the reply form field errors with their descriptions and focus in English and Romanian, including the note error after its hint and a pasted tab that becomes a space, the characters-left counters of the editor fields, the guest name and the guest note, which counts code points and keeps text past its limit, with their descriptions and limit announcement in English and Romanian, the calendar download with its alarms, the event countdown in English and Romanian, which counts days, then hours on the last day, hides at the start and shows nothing without a date, the photo
// upload and its notice, the delivery actions under the preview, the PNG download, the link preview generator or the
// Romanian language banner breaks in Chromium, a test tagged @webkit also fails in WebKit, or a page, including a page with structured data, breaks the Content-Security-Policy. The banner checks fail when
// it is missing for a Romanian browser on a paired English page, its link misses the paired page, it shows for an
// English browser or on a page without a pair, a close does not last across pages, a close with blocked storage breaks
// the page, or it writes a cookie, requests another origin or changes the canonical and hreflang links.
// The filter checks also fail when a category change misses its 150ms fade-out or its 200ms fade-in with an 8px rise,
// rapid clicks end on another category or leave an animation running, or filtering animates under reduced motion.
// The motion checks fail when a template or accent change misses the preview's 180ms settle from opacity 0.6 or a
// text edit animates it, rapid changes leave the preview faded, on an earlier accent or with an animation running, a
// share link or the sample invitation misses its single 400ms reveal with a 12px rise, or the preview, the guest view or the countdown animates
// under reduced motion.
// Run: pnpm test:browser
import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { ROUTE_PAIRS, canonicalPath } from '../public/js/i18n.js';
import { HERO_TEMPLATES, RO_HERO_TEMPLATES, inviteColors, templatesFor } from '../public/js/templates.js';
import { OCCASIONS } from '../scripts/occasions.js';
import { OCCASIONS_RO } from '../scripts/occasions-ro.js';
import { watch } from './browser-setup.js';

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

// Records each Web Animations API call on an element that matches selector as {id, category, keyframes, duration,
// startedAt} in window.animations, where category is the element's data-category and startedAt is the
// performance.now() time of the call.
const recordAnimations = (page, selector) =>
  page.addInitScript((selector) => {
    const record = /** @type {any} */ (window);
    const animate = Element.prototype.animate;
    record.animations = [];
    Element.prototype.animate = function (keyframes, options) {
      if (this.matches(selector)) {
        record.animations.push({
          id: this.id,
          category: /** @type {HTMLElement} */ (this).dataset.category,
          keyframes,
          duration: typeof options === 'number' ? options : options?.duration,
          startedAt: performance.now(),
        });
      }
      return animate.call(this, keyframes, options);
    };
  }, selector);
const recordedAnimations = (page) => page.evaluate(() => /** @type {any} */ (window).animations);
const runningGalleryAnimations = (page) =>
  page.evaluate(() => document.getElementById('gallery').getAnimations({ subtree: true }).length);
const countOf = (category) => templatesFor('en').filter((t) => t.category === category).length;

test('a category change fades the cards out over 150ms, then fades the new cards in and raises them 8px over 200ms', async ({
  page,
}) => {
  await recordAnimations(page, '#gallery .card');
  await page.goto('/');
  await page.click('.filter[data-filter="Wedding"]');
  await expect(page.locator('#gallery .card:visible')).toHaveCount(countOf('Wedding'));
  await expect.poll(() => runningGalleryAnimations(page)).toBe(0);
  const animations = await recordedAnimations(page);
  const fadeOut = animations.filter((call) => call.duration === 150);
  const fadeIn = animations.filter((call) => call.duration === 200);
  expect(fadeOut.map((call) => call.keyframes)).toEqual(
    Array(templatesFor('en').length).fill([{ opacity: 1 }, { opacity: 0 }]),
  );
  expect(fadeIn.map((call) => [call.category, call.keyframes])).toEqual(
    Array(countOf('Wedding')).fill([
      'Wedding',
      [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'none' },
      ],
    ]),
  );
  expect(animations).toHaveLength(fadeOut.length + fadeIn.length);
  // The fade-in starts once the fade-out has run its 150ms.
  const lastFadeOut = Math.max(...fadeOut.map((call) => call.startedAt));
  expect(Math.min(...fadeIn.map((call) => call.startedAt)) - lastFadeOut).toBeGreaterThanOrEqual(140);
});

// The clicks land in one task, before any fade finishes, so only the last category may fade in.
test('rapid category clicks end on the last category chosen with no animation left running', async ({ page }) => {
  await recordAnimations(page, '#gallery .card');
  await page.goto('/');
  await page.evaluate(() => {
    for (const category of ['Wedding', 'Brunch', 'All', 'Graduation', 'Birthday']) {
      /** @type {HTMLElement} */ (document.querySelector(`.filter[data-filter="${category}"]`)).click();
    }
  });
  await expect.poll(() => runningGalleryAnimations(page)).toBe(0);
  const fadedIn = (await recordedAnimations(page)).filter((call) => call.duration === 200).map((call) => call.category);
  expect(fadedIn).toEqual(Array(countOf('Birthday')).fill('Birthday'));
  await expect(page.locator('#gallery .card:visible')).toHaveCount(countOf('Birthday'));
  const shown = await page
    .locator('#gallery .card:visible')
    .evaluateAll((cards) => cards.map((card) => [card.dataset.category, getComputedStyle(card).opacity]));
  expect(shown).toEqual(Array(countOf('Birthday')).fill(['Birthday', '1']));
});

test('under reduced motion a category change switches the cards without animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await recordAnimations(page, '#gallery .card');
  await page.goto('/');
  await page.click('.filter[data-filter="Wedding"]');
  await expect(page.locator('#gallery .card:visible')).toHaveCount(countOf('Wedding'));
  await page.click('.filter[data-filter="Brunch"]');
  await expect(page.locator('#gallery .card:visible')).toHaveCount(countOf('Brunch'));
  expect(await recordedAnimations(page)).toEqual([]);
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

const PREVIEW_SETTLE = [{ opacity: 0.6 }, { opacity: 1 }];
const GUEST_REVEAL = [
  { opacity: 0, transform: 'translateY(12px)' },
  { opacity: 1, transform: 'none' },
];
const runningPreviewAnimations = (page) =>
  page.evaluate(() => document.getElementById('previewCard').getAnimations().length);
const otherWedding = templatesFor('en').find((t) => t.category === 'Wedding' && t.id !== 'wedding');

test('a template or accent change settles the preview from opacity 0.6 to 1 over 180ms, and a text edit does not', async ({
  page,
}) => {
  await recordAnimations(page, '#previewCard');
  await page.goto('editor.html?t=wedding');
  await page.fill('#title', 'Ana and Luca');
  await page.click(`.picker-item:has(input[value="${otherWedding.id}"])`);
  await page.click('.swatch:has(input[value="#52704C"])');
  await expect.poll(() => runningPreviewAnimations(page)).toBe(0);
  expect((await recordedAnimations(page)).map((call) => [call.keyframes, call.duration])).toEqual([
    [PREVIEW_SETTLE, 180],
    [PREVIEW_SETTLE, 180],
  ]);
  expect(await page.locator('#previewCard').evaluate((card) => getComputedStyle(card).opacity)).toBe('1');
});

// The changes land in one task, so each one starts before the previous one finishes.
test('rapid template and accent changes leave the latest preview fully visible with no animation running', async ({
  page,
}) => {
  await page.goto('editor.html?t=wedding');
  const running = await page.evaluate((template) => {
    for (const [name, value] of [
      ['template', template],
      ['accent', '#52704C'],
      ['accent', '#4F6993'],
    ]) {
      const input = /** @type {HTMLInputElement} */ (document.querySelector(`input[name="${name}"][value="${value}"]`));
      input.checked = true;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }
    return document.getElementById('previewCard').getAnimations().length;
  }, otherWedding.id);
  expect(running).toBe(1);
  await expect.poll(() => runningPreviewAnimations(page)).toBe(0);
  expect(await page.locator('#previewCard').evaluate((card) => getComputedStyle(card).opacity)).toBe('1');
  await expect(page.locator('#previewCard .invite')).toHaveAttribute(
    'style',
    new RegExp(`--i-accent:${inviteColors(otherWedding, '#4F6993').accent}`),
  );
});

test('a share link reveals the invitation once, fading it in and raising it 12px over 400ms', async ({
  page,
  browser,
}) => {
  await page.goto('editor.html?t=birthday');
  await page.fill('#title', 'Zoe turns 30');
  const link = await page.locator('#previewGuest').getAttribute('href');

  const guest = await (await browser.newContext()).newPage();
  await recordAnimations(guest, '#previewCard');
  await guest.goto(link);
  await expect(guest.locator('h1')).toHaveText('Zoe turns 30');
  await expect.poll(() => runningPreviewAnimations(guest)).toBe(0);
  expect((await recordedAnimations(guest)).map((call) => [call.keyframes, call.duration])).toEqual([
    [GUEST_REVEAL, 400],
  ]);
  expect(
    await guest
      .locator('#previewCard')
      .evaluate((card) => [getComputedStyle(card).opacity, getComputedStyle(card).transform]),
  ).toEqual(['1', 'none']);
});

test('under reduced motion the preview and the guest view change without animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await recordAnimations(page, '#previewCard');
  await page.goto('editor.html?t=wedding');
  await page.click(`.picker-item:has(input[value="${otherWedding.id}"])`);
  await page.click('.swatch:has(input[value="#52704C"])');
  await expect(page.locator('#previewCard .invite')).toHaveAttribute(
    'style',
    new RegExp(`--i-accent:${inviteColors(otherWedding, '#52704C').accent}`),
  );
  expect(await recordedAnimations(page)).toEqual([]);
  expect(await runningPreviewAnimations(page)).toBe(0);
  await page.goto(await page.locator('#previewGuest').getAttribute('href'));
  await expect(page.locator('body')).toHaveClass(/view-mode/);
  await expect(page.locator('#previewCard .invite')).toBeVisible();
  expect(await recordedAnimations(page)).toEqual([]);
  expect(await runningPreviewAnimations(page)).toBe(0);
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
  const ics = await readFile(await (await download).path(), 'utf8');
  expect(ics).toContain('SUMMARY:Zoe turns 30');
  expect(ics).toContain('TRIGGER:-P1D');
  expect(ics).toContain('TRIGGER:-PT2H');
  expect(await guest.evaluate(() => localStorage.length)).toBe(0);
  expect(problems).toEqual([]);
});

// The share link of an invite on 12 December 2026 at 14:00 in Bucharest, 12:00 UTC, opened by a guest in Bucharest
// whose clock reads now. The guest's timers run only when the test moves the clock.
async function countdownGuest(page, browser, editor, now, date = '2026-12-12') {
  await page.goto(editor);
  await page.fill('#title', 'Zoe turns 30');
  await page.fill('#date', date);
  await page.fill('#time', '14:00');
  const link = await page.locator('#previewGuest').getAttribute('href');
  const guest = await (await browser.newContext({ timezoneId: 'Europe/Bucharest' })).newPage();
  await guest.clock.install({ time: new Date(now) });
  await guest.goto(link);
  await expect(guest.locator('h1')).toHaveText('Zoe turns 30');
  return guest;
}
const HOUR = 60 * 60 * 1000;

for (const [editor, days, hours] of [
  ['editor.html', 'Starts in 11 days', 'Starts in 3 hours'],
  ['ro/editor.html', 'Începe peste 11 zile', 'Începe peste 3 ore'],
]) {
  test(`the guest view of ${editor} counts down in days, then in hours on the last day, and hides at the start`, async ({
    page,
    browser,
  }) => {
    const guest = await countdownGuest(page, browser, editor, '2026-12-01T08:00:00Z');
    await expect(guest.locator('#countdown')).toHaveText(days);
    await guest.clock.fastForward(11 * 24 * HOUR + HOUR);
    await expect(guest.locator('#countdown')).toHaveText(hours);
    await guest.clock.fastForward(3 * HOUR);
    await expect(guest.locator('#countdown')).toBeHidden();
  });
}

test('the guest view of an invite without a date shows no countdown', async ({ page, browser }) => {
  const guest = await countdownGuest(page, browser, 'editor.html', '2026-12-01T08:00:00Z', '');
  await expect(guest.locator('#previewCard .invite')).toBeVisible();
  await expect(guest.locator('#countdown')).toBeHidden();
});

test('under reduced motion the countdown shows and changes without animation', async ({ page, browser }) => {
  const guest = await countdownGuest(page, browser, 'editor.html', '2026-12-12T08:00:00Z');
  await guest.emulateMedia({ reducedMotion: 'reduce' });
  await recordAnimations(guest, '#countdown');
  await guest.reload();
  await expect(guest.locator('#countdown')).toHaveText('Starts in 4 hours');
  await guest.clock.fastForward(HOUR);
  await expect(guest.locator('#countdown')).toHaveText('Starts in 3 hours');
  expect(await recordedAnimations(guest)).toEqual([]);
  expect(await guest.locator('#countdown').evaluate((element) => element.getAnimations().length)).toBe(0);
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

  await recordAnimations(page, '#previewCard');
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
  await expect(page.locator('#guestName')).toHaveAccessibleDescription('Enter your name.');
  await expect(page.locator('#replySaved')).toBeHidden();

  await page.fill('#guestName', 'Alex');
  await page.fill('#partySize', '2');
  await page.click('#sendReply');
  await expect(page.locator('#rsvpStatus')).toContainText('Nothing was sent');
  await expect(page.locator('#replySaved')).toBeHidden();
  expect(await page.evaluate(() => location.hash)).toBe('');
  expect(apiRequests).toEqual([]);
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  // The sample reveals once, and the replies above do not replay it.
  expect((await recordedAnimations(page)).map((call) => [call.keyframes, call.duration])).toEqual([
    [GUEST_REVEAL, 400],
  ]);
  expect(problems).toEqual([]);
});

// The note hint in each page language, the note field's description before any counter or error.
const NOTE_HINTS = {
  en: 'Dietary needs or a message. Visible only to the host.',
  ro: 'Restricții alimentare sau un mesaj. Doar gazda îl vede.',
};

// The reply form's invalid fields: each name in invalid has aria-invalid and its error as its description after any
// hint and counter, and every other field has neither, only its hint and counter. counts holds the counter text of
// each field name that shows one.
async function expectFieldErrors(page, invalid, counts = {}) {
  const noteHint = NOTE_HINTS[await page.locator('html').getAttribute('lang')];
  const fields = {
    '#guestName': ['name', ''],
    '[role="radiogroup"]': ['attending', ''],
    '#partySize': ['partySize', ''],
    '#guestNote': ['note', noteHint],
  };
  for (const [selector, [field, hint]] of Object.entries(fields)) {
    const locator = page.locator(`#rsvpForm ${selector}`);
    if (field in invalid) {
      await expect(locator).toHaveAttribute('aria-invalid', 'true');
      await expect(locator).toHaveAccessibleDescription(
        [hint, counts[field], invalid[field]].filter(Boolean).join(' '),
      );
      await expect(page.getByText(invalid[field], { exact: true })).toBeVisible();
    } else {
      await expect(locator).not.toHaveAttribute('aria-invalid');
      await expect(locator).toHaveAccessibleDescription([hint, counts[field]].filter(Boolean).join(' '));
    }
  }
}

// Unchecks both answers, a state the form only reaches when a script or extension changes it.
const clearAnswer = (page) =>
  page.locator('#rsvpForm input[name="attending"]').evaluateAll((radios) => {
    for (const radio of /** @type {HTMLInputElement[]} */ (radios)) radio.checked = false;
  });

test(
  'an invalid reply shows an error under each invalid field, focuses the first and clears each fixed one',
  { tag: '@webkit' },
  async ({ page }) => {
    const problems = watch(page);
    await page.goto('editor.html?view=1&sample=1');
    await page.fill('#partySize', '0');
    await page.click('#sendReply');
    await expectFieldErrors(page, { name: 'Enter your name.', partySize: 'Enter a number from 1 to 10.' });
    await expect(page.locator('#guestName')).toBeFocused();
    await expect(page.locator('#rsvpStatus')).toBeEmpty();

    await page.fill('#guestName', 'Alex');
    await page.click('#sendReply');
    await expectFieldErrors(page, { partySize: 'Enter a number from 1 to 10.' });
    await expect(page.locator('#partySize')).toBeFocused();

    await clearAnswer(page);
    await page.click('#sendReply');
    await expectFieldErrors(page, { attending: 'Choose whether you will attend.' });
    await expect(page.locator('#rsvpForm input[name="attending"]').first()).toBeFocused();

    await page.check('#rsvpForm input[name="attending"][value="yes"]');
    await page.fill('#partySize', '2');
    await page.click('#sendReply');
    await expectFieldErrors(page, {});
    await expect(page.locator('#rsvpStatus')).toContainText('Nothing was sent');
    expect(problems).toEqual([]);
  },
);

test('the Romanian reply form shows its field errors in Romanian', { tag: '@webkit' }, async ({ page }) => {
  await page.goto('ro/editor.html?view=1&sample=1');
  await page.fill('#partySize', '11');
  await page.click('#sendReply');
  await expectFieldErrors(page, { name: 'Scrie-ți numele.', partySize: 'Scrie un număr de la 1 la 10.' });
  await clearAnswer(page);
  await page.click('#sendReply');
  await expectFieldErrors(page, { name: 'Scrie-ți numele.', attending: 'Alege dacă participi.' });
});

test(
  'a note over 300 characters shows its error under the note in English and Romanian',
  { tag: '@webkit' },
  async ({ page }) => {
    const problems = watch(page);
    await page.goto('editor.html?view=1&sample=1');
    await expect(page.locator('#guestNote')).toHaveAccessibleName('Note (optional)');
    await page.fill('#guestName', 'Alex');
    await page.fill('#guestNote', 'x'.repeat(301));
    await page.click('#sendReply');
    await expectFieldErrors(page, { note: 'Use at most 300 characters.' }, { note: '0 left' });
    await expect(page.locator('#guestNote')).toBeFocused();
    await page.fill('#guestNote', 'x'.repeat(300));
    await page.click('#sendReply');
    await expectFieldErrors(page, {}, { note: '0 left' });
    await expect(page.locator('#rsvpStatus')).toContainText('Nothing was sent');
    // A tab pasted from a spreadsheet becomes a space instead of an error that names the length.
    await page.fill('#guestNote', 'Vegan\tno nuts');
    await page.click('#sendReply');
    await expectFieldErrors(page, {});

    await page.goto('ro/editor.html?view=1&sample=1');
    await expect(page.locator('#guestNote')).toHaveAccessibleName('Notă (opțional)');
    await page.fill('#guestName', 'Ana');
    await page.fill('#guestNote', 'x'.repeat(301));
    await page.click('#sendReply');
    await expectFieldErrors(page, { note: 'Folosește cel mult 300 de caractere.' }, { note: 'Mai rămân 0' });
    expect(problems).toEqual([]);
  },
);

// The counter of a limited field: hidden with an empty live region up to 80% of the limit, then the text left as the
// field's description after any hint, and in the live region only at the limit.
async function expectCounter(page, field, length, text, { announced = false, hint = '' } = {}) {
  await page.fill(field, 'x'.repeat(length));
  const counter = page.locator(`${field} + .counter`);
  if (text) await expect(counter).toHaveText(text);
  else await expect(counter).toBeHidden();
  await expect(page.locator(field)).toHaveAccessibleDescription([hint, text].filter(Boolean).join(' '));
  await expect(page.locator('#limitAlert')).toHaveText(announced ? text : '');
}

test('a limited editor field counts the characters left above 80% of its limit', async ({ page }) => {
  const problems = watch(page);
  await page.goto('editor.html?t=birthday');
  await expectCounter(page, '#title', 38, '');
  await expectCounter(page, '#title', 39, '9 left');
  await expectCounter(page, '#title', 48, '0 left', { announced: true });
  await expectCounter(page, '#title', 47, '1 left');
  await expect(page.locator('#date + .counter')).toHaveCount(0);
  await expect(page.locator('#time + .counter')).toHaveCount(0);
  await page.fill('#title', 'x'.repeat(45));
  await expect.poll(() => page.evaluate(() => localStorage.getItem('petalpost:draft'))).toContain('x'.repeat(45));
  await page.goto('editor.html');
  await expect(page.locator('#title + .counter')).toHaveText('3 left');
  expect(problems).toEqual([]);
});

test('the guest name counts the characters left in English and Romanian', async ({ page }) => {
  await page.goto('editor.html?view=1&sample=1');
  await expectCounter(page, '#guestName', 64, '');
  await expectCounter(page, '#guestName', 65, '15 left');
  await page.fill('#partySize', '0');
  await page.click('#sendReply');
  await expect(page.locator('#guestName')).toHaveAccessibleDescription('15 left');
  await expect(page.locator('#partySize')).toHaveAccessibleDescription('Enter a number from 1 to 10.');
  await expectCounter(page, '#guestName', 80, '0 left', { announced: true });

  await page.goto('ro/editor.html?view=1&sample=1');
  await expectCounter(page, '#guestName', 70, 'Mai rămân 10');
  await expectCounter(page, '#guestName', 79, 'Mai rămâne 1');
  await expectCounter(page, '#guestName', 80, 'Mai rămân 0', { announced: true });
  await page.goto('ro/editor.html?t=birthday');
  await expectCounter(page, '#message', 100, 'Mai rămân 10');
});

// The note's counter follows its hint in the description.
test('the guest note counts the characters left after its hint in English and Romanian', async ({ page }) => {
  await page.goto('editor.html?view=1&sample=1');
  await expectCounter(page, '#guestNote', 240, '', { hint: NOTE_HINTS.en });
  await expectCounter(page, '#guestNote', 241, '59 left', { hint: NOTE_HINTS.en });
  await expectCounter(page, '#guestNote', 300, '0 left', { hint: NOTE_HINTS.en, announced: true });
  // The note counts code points, as the server does, so 250 emoji leave 50 although they take 500 UTF-16 units.
  await page.fill('#guestNote', '🎂'.repeat(250));
  await expect(page.locator('#guestNote + .counter')).toHaveText('50 left');
  // Text past the limit stays in the field, the counter stops at 0, and only the arrival at the limit announces.
  await expectCounter(page, '#guestNote', 300, '0 left', { hint: NOTE_HINTS.en, announced: true });
  await page.locator('#guestNote').pressSequentially('xy');
  await expect(page.locator('#guestNote')).toHaveValue('x'.repeat(300) + 'xy');
  await expect(page.locator('#guestNote + .counter')).toHaveText('0 left');
  await expect(page.locator('#limitAlert')).toHaveText('');
  await page.goto('ro/editor.html?view=1&sample=1');
  await expectCounter(page, '#guestNote', 299, 'Mai rămâne 1', { hint: NOTE_HINTS.ro });
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
