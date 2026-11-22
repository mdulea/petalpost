// Fails when a template's text colors, or any accent swatch as rendered on it, drop below WCAG AA (4.5:1) on its card background, when a core site text-on-surface token pair in css/styles.css drops below 4.5:1, or when a css/styles.css rule pairing color and background tokens drops below 4.5:1.
// Run: node scripts/check-contrast.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import * as ctx from '../js/templates.js';

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

for (const t of ctx.TEMPLATES) {
  test(`${t.id}: ink, accent and every accent swatch reach 4.5:1 on ${t.colors.bg}`, () => {
    const shown = [
      ['ink', t.colors.ink],
      ['accent', t.colors.accent],
      ...ctx.ACCENTS.map((a) => [`${a.name} accent`, ctx.inviteColors(t, a.hex).accent]),
    ];
    const low = shown
      .map(([name, hex]) => [name, hex, ratio(hex, t.colors.bg)])
      .filter(([, , r]) => r < 4.5)
      .map(([name, hex, r]) => `${name} ${hex} at ${r.toFixed(2)}:1`);
    assert.deepEqual(low, []);
  });
}

const css = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
const tokens = Object.fromEntries(
  [...css.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6});/gi)].map(([, name, hex]) => [name, hex]),
);
const resolveColor = (value) => {
  const token = value.match(/var\(--([a-z0-9-]+)\)/i)?.[1];
  if (token) return tokens[token] ?? null;
  if (/^#fff(?:fff)?$/i.test(value.trim())) return '#ffffff';
  return /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : null;
};

test('core site text and surface token pairs reach 4.5:1 in css/styles.css', () => {
  const pairs = [
    ...['ink', 'muted', 'rose-deep'].flatMap((fg) =>
      ['bg', 'surface', 'surface-2', 'sand', 'sage-soft', 'rose-soft'].map((bg) => [fg, bg]),
    ),
    ...['bg', 'surface', 'surface-2'].map((bg) => ['sage-deep', bg]),
    ['sage-hover', 'sage-soft'],
    ...['sage-deep', 'sage-hover', 'rose-deep', 'ink'].map((bg) => ['#ffffff', bg]),
  ];
  const low = pairs
    .map(([fg, bg]) => ({ fg, bg, r: ratio(fg.startsWith('#') ? fg : tokens[fg], tokens[bg]) }))
    .filter(({ r }) => r < 4.5)
    .map(({ fg, bg, r }) => `${fg} on ${bg} at ${r.toFixed(2)}:1`);
  assert.deepEqual(low, []);
});

test('every css/styles.css rule pairing color and background tokens reaches 4.5:1', () => {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const low = [];
  for (const [, selector, body] of clean.matchAll(/([^{}]+)\{([^{}]+)\}/g)) {
    const color = body.match(/(?:^|[;\s])color:\s*([^;]+)/i)?.[1];
    const background = body.match(/background(?:-color)?:\s*([^;]+)/i)?.[1];
    if (!color || !background) continue;
    const fg = resolveColor(color);
    const bg = resolveColor(background);
    if (!fg || !bg) continue;
    const r = ratio(fg, bg);
    if (r < 4.5) low.push(`${selector.trim()}: ${color.trim()} on ${background.trim()} at ${r.toFixed(2)}:1`);
  }
  assert.deepEqual(low, []);
});
