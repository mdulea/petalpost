// Fails when a template's text colors, or any accent swatch as rendered on it, drop below WCAG AA (4.5:1) on its card background.
// Run: node scripts/check-contrast.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
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
