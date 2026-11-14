// Fails when, at any tested viewport in Chromium or WebKit, a page scrolls sideways, a form control leaves its panel,
// single-line inputs differ in height, fields sharing a row differ in top or height, the spacing between stacked
// fields is uneven, or the floating Preview button leaves the panels' right edge.
// The widths are both sides of every width breakpoint in css/styles.css plus common phone, tablet and desktop widths,
// so a new breakpoint is tested without editing this file.
// Run: pnpm test:browser
import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

const CSS = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
const BREAKPOINTS = [...CSS.matchAll(/\((max|min)-width:\s*(\d+)px\)/g)].flatMap(([, side, px]) =>
  side === 'max' ? [Number(px), Number(px) + 1] : [Number(px) - 1, Number(px)],
);
// iPhone SE, iPhone 13 to 17, Plus and Max phones, iPad mini, iPad, iPad Air, laptops and desktops.
const DEVICES = [320, 375, 390, 402, 414, 430, 440, 744, 768, 820, 1024, 1280, 1440, 1920];
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
    const [first, ...rest] = [...row.querySelectorAll('.input')].map((c) => c.getBoundingClientRect());
    for (const c of rest) {
      if (!near(c.left, first.left) && !near(c.top, first.top))
        problems.push(`${name(row)} row controls differ in top`);
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

test('the landing page and the guest view fit every viewport', async ({ page }) => {
  await page.goto('/');
  await checkAllViewports(page);
  await page.goto('editor.html?t=birthday');
  await page.goto(await page.locator('#previewGuest').getAttribute('href'));
  await checkAllViewports(page);
});
