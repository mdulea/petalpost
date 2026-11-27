// Fails when, at any tested viewport in Chromium or WebKit, the landing, editor, guest, sample guest, invitation,
// management, privacy, terms, About, guide or occasion page, or an English page showing the Romanian language banner,
// scrolls sideways, a form control leaves its panel, single-line inputs differ in height, fields sharing a row differ
// in top, height or overlap horizontally, the spacing between stacked fields is uneven, the floating Preview button
// leaves the panels' right edge, a control is smaller than its target size, or the Preview button covers a control that
// has keyboard focus. On the English and Romanian landing pages it fails when the Create invite bar shows at 640px or
// wider, beside the hero button or the footer, or not between them below 640px; links anywhere but the editor in the
// page language; lacks safe-area padding; covers a control that has keyboard focus; or slides under reduced motion.
// Target sizes: 44px where the primary pointer is touch, which is iOS's minimum, and 24px elsewhere, which is
// WCAG 2.2 Target Size (Minimum). Links inside a sentence are exempt, as WCAG allows. A stretched link is measured by
// the card it covers.
// The widths are both sides of every width breakpoint in css/styles.css plus common phone, tablet and desktop widths,
// so a new breakpoint is tested without editing this file.
// Run: pnpm test:browser
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const CSS = readFileSync(new URL('../public/css/styles.css', import.meta.url), 'utf8');
const BREAKPOINTS = [...CSS.matchAll(/\((max|min)-width:\s*(\d+)px\)/g)].flatMap(([, side, px]) =>
  side === 'max' ? [Number(px), Number(px) + 1] : [Number(px) - 1, Number(px)],
);
// iPhone SE, iPhone 13 to 17, Plus and Max phones, iPad mini, iPad, iPad Air, laptops, desktops, 1440p and 4K.
const DEVICES = [320, 375, 390, 402, 414, 430, 440, 744, 768, 820, 1024, 1280, 1440, 1920, 2560, 3840];
const WIDTHS = [...new Set([...BREAKPOINTS, ...DEVICES])].sort((a, b) => a - b);
// Landscape phones and tablets, where the height is the short side.
const VIEWPORTS = [
  ...WIDTHS.map((width) => ({ width, height: 900 })),
  { width: 874, height: 402 },
  { width: 1133, height: 744 },
];

// Sub-pixel rounding differs between engines; one CSS pixel is below what a reader sees.
const SLACK = 1;

// Returns one message per broken rule on the current page, empty when the layout holds.
function layoutProblems(slack) {
  const problems = [];
  const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const near = (a, b) => Math.abs(a - b) <= slack;
  const name = (el) => '#' + (el.id || el.querySelector('[id]')?.id || el.closest('[id]')?.id);

  if (document.documentElement.scrollWidth > innerWidth) {
    problems.push(`page is ${document.documentElement.scrollWidth}px wide`);
  }

  const panels = [...document.querySelectorAll('.panel')].filter(visible);
  for (const panel of panels) {
    const box = panel.getBoundingClientRect();
    const style = getComputedStyle(panel);
    const left = box.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
    const right = box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
    for (const control of [...panel.querySelectorAll('.input, .btn')].filter(visible)) {
      const rect = control.getBoundingClientRect();
      if (rect.left < left - slack || rect.right > right + slack) problems.push(`${name(control)} leaves its panel`);
    }

    // Stacked fields: the gap from the lowest bottom of one line of fields to the top of the next line is constant.
    const lines = [];
    for (const field of [...panel.querySelectorAll('.field')].filter(visible)) {
      const rect = field.getBoundingClientRect();
      const line = lines.find((l) => near(l.top, rect.top));
      if (line) line.bottom = Math.max(line.bottom, rect.bottom);
      else lines.push({ top: rect.top, bottom: rect.bottom, field });
    }
    lines.sort((a, b) => a.top - b.top);
    const gaps = lines.slice(1).map((line, i) => ({ gap: line.top - lines[i].bottom, field: line.field }));
    for (const { gap, field } of gaps) {
      if (!near(gap, gaps[0].gap))
        problems.push(`${name(field)} is ${gap}px below the field above, not ${gaps[0].gap}px`);
    }
  }

  const single = [...document.querySelectorAll('input.input')].filter(visible);
  for (const input of single) {
    const height = input.getBoundingClientRect().height;
    if (!near(height, single[0].getBoundingClientRect().height)) problems.push(`${name(input)} is ${height}px tall`);
  }

  for (const row of [...document.querySelectorAll('.field-row')].filter(visible)) {
    const boxes = [...row.querySelectorAll('.input')].map((c) => c.getBoundingClientRect());
    const [first, ...rest] = boxes;
    for (const c of rest) {
      if (!near(c.left, first.left) && !near(c.top, first.top))
        problems.push(`${name(row)} row controls differ in top`);
    }
    const byLeft = [...boxes].sort((a, b) => a.left - b.left);
    for (let i = 1; i < byLeft.length; i += 1) {
      if (near(byLeft[i].top, byLeft[i - 1].top) && byLeft[i].left < byLeft[i - 1].right - slack) {
        problems.push(`${name(row)} row controls overlap horizontally`);
      }
    }
  }

  const target = matchMedia('(pointer: coarse)').matches ? 44 : 24;
  const controls = 'a[href], button, .input, .range, .picker-item, .swatch, .filter, .pill, .btn';
  const found = /** @type {HTMLElement[]} */ ([...document.querySelectorAll(controls)]);
  for (const control of found.filter(visible)) {
    if (control.matches('p a, li a')) continue;
    // A stretched link's ::after covers its card, so the card is the target.
    const stretched = getComputedStyle(control, '::after').position === 'absolute';
    const rect = (stretched ? control.offsetParent : control).getBoundingClientRect();
    if (rect.width < target - slack || rect.height < target - slack) {
      problems.push(`${name(control)} ${control.tagName} is ${Math.round(rect.width)}x${Math.round(rect.height)}px`);
    }
  }

  const jump = document.querySelector('.jump-preview');
  if (jump && visible(jump) && panels.length) {
    const right = panels[0].getBoundingClientRect().right;
    const rect = jump.getBoundingClientRect();
    if (!near(rect.right, right)) problems.push(`Preview button ends at ${rect.right}px, panels at ${right}px`);
    if (rect.bottom > innerHeight) problems.push('Preview button is below the viewport');
  }
  return problems;
}

// Checks every viewport on one page and reports all failures together, so one run shows the whole breakage.
async function checkAllViewports(page) {
  const failures = [];
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => new Promise(requestAnimationFrame));
    for (const problem of await page.evaluate(layoutProblems, SLACK)) {
      failures.push(`${viewport.width}x${viewport.height}: ${problem}`);
    }
  }
  expect(failures).toEqual([]);
}

test('the editor keeps its grid at every viewport', async ({ page }) => {
  await page.goto('editor.html?t=birthday');
  await page.fill('#date', '2026-12-12');
  await page.fill('#time', '14:00');
  await checkAllViewports(page);
});

// Tabs from the page top through the form at each narrow viewport, where the Preview button floats.
test('the Preview button never covers the focused control', async ({ page }) => {
  // Triples the project timeout: Chromium takes about 27 seconds, and Linux WebKit with two workers about 3.5 minutes.
  test.slow();
  const failures = [];
  for (const viewport of VIEWPORTS.filter(({ width }) => width <= 960)) {
    await page.setViewportSize(viewport);
    await page.goto('editor.html?t=birthday');
    let state = 'before';
    for (let step = 0; step < 80 && state !== 'after'; step += 1) {
      await page.keyboard.press('Tab');
      // Two frames: the browser's focus scroll, then the editor's scroll above the button.
      state = await page.evaluate(
        () =>
          new Promise((done) =>
            requestAnimationFrame(() =>
              requestAnimationFrame(() => {
                const focused = document.activeElement;
                if (!focused?.closest('#form')) return done(document.body.dataset.tabbed ? 'after' : 'before');
                document.body.dataset.tabbed = 'yes';
                // Hidden radios and the file input show through their label.
                const a = (focused.closest('label') ?? focused).getBoundingClientRect();
                const b = document.querySelector('.jump-preview').getBoundingClientRect();
                const covered = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
                done(covered ? `#${focused.id || focused.getAttribute('name')} is under the Preview button` : 'inside');
              }),
            ),
          ),
      );
      if (state.startsWith('#')) failures.push(`${viewport.width}x${viewport.height}: ${state}`);
    }
  }
  expect(failures).toEqual([]);
});

// The Create invite bar on both landing pages, which shows below 640px.
const STICKY_PAGES = [
  { path: '/', href: 'editor.html', label: 'Create invite' },
  { path: '/ro/', href: '/ro/editor.html', label: 'Creează invitație' },
];
const STICKY_WIDTHS = [...VIEWPORTS.filter(({ width }) => width < 640), { width: 640, height: 900 }];

// Scrolls the landing page to the place, waits for the Create invite bar to finish sliding, and returns whether it
// shows: visible and inside the viewport.
async function stickyShownAt(page, place) {
  return page.evaluate(async (place) => {
    const target = {
      top: 0,
      hero: document.querySelector('.hero .btn-primary').getBoundingClientRect().bottom + scrollY + 1,
      gallery: document.getElementById('templates').offsetTop,
      bottom: document.documentElement.scrollHeight,
    }[place];
    scrollTo({ top: target, behavior: 'instant' });
    const bar = document.getElementById('stickyCta');
    // The page's intersection observer runs some frames after the scroll, more of them on a slow runner, so this
    // waits up to 60 frames for data-shown to match the geometry. An observer that never updates fails below.
    const onScreen = (el) => {
      const rect = el.getBoundingClientRect();
      return rect.bottom >= 0 && rect.top <= innerHeight;
    };
    const shown = ![document.querySelector('.hero .btn-primary'), document.querySelector('.site-footer')].some(
      onScreen,
    );
    for (let frame = 0; frame < 60 && bar.hasAttribute('data-shown') !== shown; frame++) {
      await new Promise(requestAnimationFrame);
    }
    // When the observer flips data-shown during a slide, the browser cancels that transition, and its finished
    // promise rejects with an AbortError. This waits until no transition runs, whether it ended or was cancelled.
    while (bar.getAnimations().length) await Promise.allSettled(bar.getAnimations().map((a) => a.finished));
    const rect = bar.getBoundingClientRect();
    return getComputedStyle(bar).visibility === 'visible' && rect.height > 0 && rect.top < innerHeight;
  }, place);
}

test('the Create invite bar shows below 640px between the hero button and the footer and links to the editor', async ({
  page,
}) => {
  test.slow();
  const failures = [];
  for (const { path, href, label } of STICKY_PAGES) {
    await page.goto(path);
    const link = page.locator('#stickyCta a');
    await expect(link).toHaveAttribute('href', href);
    await expect(link).toHaveText(label);
    for (const viewport of STICKY_WIDTHS) {
      await page.setViewportSize(viewport);
      const narrow = viewport.width < 640;
      const at = `${path} ${viewport.width}x${viewport.height}`;
      if (await stickyShownAt(page, 'top')) failures.push(`${at}: shows beside the hero button`);
      if ((await stickyShownAt(page, 'hero')) !== narrow) failures.push(`${at}: past the hero button`);
      if ((await stickyShownAt(page, 'gallery')) !== narrow) failures.push(`${at}: at the gallery`);
      if (await stickyShownAt(page, 'bottom')) failures.push(`${at}: shows beside the footer`);
    }
  }
  expect(failures).toEqual([]);
});

// No test browser has a notch or home indicator, so env() is 0 there; this reads the declared padding instead.
test('the Create invite bar pads for the safe-area insets', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto('/');
  const padding = await page.evaluate(() => {
    const rules = [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules]);
    const narrow = /** @type {CSSMediaRule} */ (
      rules.find((rule) => rule instanceof CSSMediaRule && rule.conditionText === '(max-width: 639px)')
    );
    const bar = [...narrow.cssRules].find(
      (rule) => rule instanceof CSSStyleRule && rule.selectorText === '.sticky-cta',
    );
    const style = /** @type {CSSStyleRule} */ (bar).style;
    return [style.paddingLeft, style.paddingRight, style.paddingBottom];
  });
  expect(padding[0]).toContain('env(safe-area-inset-left)');
  expect(padding[1]).toContain('env(safe-area-inset-right)');
  expect(padding[2]).toContain('env(safe-area-inset-bottom)');
});

test('the Create invite bar slides in, and appears without motion under reduced motion', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  // Scrolls past the hero button and returns how many animations the bar has once it gets data-shown.
  const slides = () =>
    page.evaluate(
      () =>
        new Promise((done) => {
          const bar = document.getElementById('stickyCta');
          new MutationObserver(() => done(bar.getAnimations().length)).observe(bar, { attributes: true });
          scrollTo({ top: document.getElementById('templates').offsetTop, behavior: 'instant' });
        }),
    );
  await page.goto('/');
  expect(await slides()).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  expect(await slides()).toBe(0);
  await expect(page.locator('#stickyCta')).toBeVisible();
});

// Tabs from the page top to the footer at narrow viewports, where the Create invite bar shows. Playwright's WebKit
// moves focus to links neither with Tab nor with Option+Tab, as Safari does by default, so there the test focuses the
// next link or button in document order from script after a Shift press, which keeps focus keyboard-driven, and
// focus() scrolls it into view as Tab does.
test('the Create invite bar never covers the focused control', async ({ page, browserName }) => {
  // Each focus step waits for the scroll to settle. The test takes about 1.5 minutes in Chromium and in WebKit.
  test.setTimeout(300000);
  const failures = [];
  for (const { path } of STICKY_PAGES) {
    for (const viewport of [320, 390, 639].map((width) => ({ width, height: 900 }))) {
      await page.setViewportSize(viewport);
      await page.goto(path);
      let state = 'inside';
      for (let step = 0; step < 300 && state !== 'footer'; step += 1) {
        await page.keyboard.press(browserName === 'webkit' ? 'Shift' : 'Tab');
        state = await page.evaluate(async (scripted) => {
          if (scripted) {
            const order = /** @type {HTMLElement[]} */ ([...document.querySelectorAll('a[href], button')]).filter(
              (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden',
            );
            order[order.indexOf(/** @type {HTMLElement} */ (document.activeElement)) + 1]?.focus();
          }
          // The focus scroll is smooth in WebKit, so this waits for three frames without scrolling, which covers
          // the observer and the page's scroll above the bar.
          for (let still = 0, y = NaN; still < 3; y = scrollY) {
            await new Promise(requestAnimationFrame);
            still = scrollY === y ? still + 1 : 0;
          }
          const bar = document.getElementById('stickyCta');
          // A cancelled slide rejects finished, as in stickyShownAt.
          while (bar.getAnimations().length) await Promise.allSettled(bar.getAnimations().map((a) => a.finished));
          const focused = document.activeElement;
          if (focused.closest('.site-footer')) return 'footer';
          if (focused === document.body || bar.contains(focused)) return 'inside';
          if (getComputedStyle(bar).visibility !== 'visible') return 'inside';
          const a = focused.getBoundingClientRect();
          const b = bar.getBoundingClientRect();
          const covered = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
          const label = `${focused.tagName} ${focused.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)}`;
          return covered ? `${label} is under the bar` : 'inside';
        }, browserName === 'webkit');
        if (state.endsWith('under the bar')) failures.push(`${path} ${viewport.width}x${viewport.height}: ${state}`);
      }
      if (state !== 'footer')
        failures.push(`${path} ${viewport.width}x${viewport.height}: focus never reached the footer`);
    }
  }
  expect(failures).toEqual([]);
});

test('the landing page, the guest view, the privacy page and the terms page fit every viewport', async ({ page }) => {
  await page.goto('/');
  await checkAllViewports(page);
  await page.goto('editor.html?t=birthday');
  await page.goto(await page.locator('#previewGuest').getAttribute('href'));
  await checkAllViewports(page);
  await page.goto('privacy.html');
  await checkAllViewports(page);
  await page.goto('terms.html');
  await checkAllViewports(page);
});

test('the sample guest invitation fits every viewport', async ({ page }) => {
  await page.goto('editor.html?view=1&sample=1');
  await checkAllViewports(page);
});

// One occasion page stands for all six, which scripts/pages.js builds from the same markup.
test('the About page, both guides and an occasion page fit every viewport', async ({ page }) => {
  for (const path of [
    'about.html',
    'invitation-wording.html',
    'when-to-send-invitations.html',
    'wedding-invitations.html',
  ]) {
    await page.goto(path);
    await checkAllViewports(page);
  }
});

test('the Romanian landing, editor, Botez and Moț occasion and two guide pages fit every viewport', async ({
  page,
}) => {
  for (const path of [
    '/ro/',
    '/ro/editor.html?t=botez-porumbel',
    '/ro/invitatii-botez.html',
    '/ro/invitatii-mot.html',
    '/ro/text-invitatii.html',
    '/ro/invitatii-digitale-sau-tiparite.html',
  ]) {
    await page.goto(path);
    await checkAllViewports(page);
  }
});

test('the editor after publishing, the invitation with a saved reply and the management page fit every viewport', async ({
  page,
  browser,
}) => {
  await page.goto('editor.html?t=birthday');
  await page.click('#publish');
  await expect(page.locator('#published')).toBeVisible();
  const manage = await page.locator('#manageLink').inputValue();
  await checkAllViewports(page);
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(await page.locator('#eventLink').inputValue());
  await guest.fill('#guestName', 'Sam');
  await guest.click('#sendReply');
  await expect(guest.locator('#replySaved')).toBeVisible();
  await checkAllViewports(guest);
  await page.goto(manage);
  await expect(page.locator('#responseList li')).toHaveCount(1);
  await checkAllViewports(page);
});

test.describe('a Romanian browser', () => {
  test.use({ locale: 'ro-RO' });

  test('sees the Romanian language banner fit every viewport on the landing, editor, occasion and privacy pages', async ({
    page,
  }) => {
    for (const path of ['/', 'editor.html?t=birthday', 'wedding-invitations.html', 'privacy.html']) {
      await page.goto(path);
      await expect(page.locator('.lang-banner')).toBeVisible();
      await checkAllViewports(page);
    }
  });
});
