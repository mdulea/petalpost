// Fails when a template's text colors, or any accent swatch as rendered on it, drop below WCAG AA (4.5:1) on its card background.
// Run: node scripts/check-contrast.js
import * as ctx from '../js/templates.js';

const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

let failures = 0;
for (const t of ctx.TEMPLATES) {
  for (const key of ['ink', 'accent']) {
    const r = ratio(t.colors[key], t.colors.bg);
    if (r < 4.5) { console.log(`${t.id}: ${key} ${t.colors[key]} on ${t.colors.bg} is ${r.toFixed(2)}:1`); failures++; }
  }
  for (const a of ctx.ACCENTS) {
    const shown = ctx.inviteColors(t, a.hex).accent;
    const r = ratio(shown, t.colors.bg);
    if (r < 4.5) { console.log(`${t.id}: ${a.name} accent renders ${shown} on ${t.colors.bg} at ${r.toFixed(2)}:1`); failures++; }
  }
}
const counts = {};
ctx.TEMPLATES.forEach((t) => { counts[t.category] = (counts[t.category] || 0) + 1; });
console.log(`${ctx.TEMPLATES.length} templates`, counts);
process.exit(failures ? 1 : 0);
