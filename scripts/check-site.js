// Fails when the pages, robots.txt and sitemap.xml disagree on the production origin, the sitemap misses an indexed page, a page has no favicon, the contact address differs between pages, editor.html lacks a control for an invite field, a template's frame or title font has no CSS rule, a CSS custom property refers to itself, or the index.html template or accent count differs from the data.
// Run: node scripts/check-site.js
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import { EDITABLE } from '../js/invite.js';
import { ACCENTS, TEMPLATES } from '../js/templates.js';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const attr = (html, pattern) => (html.match(pattern) || [])[1];

// Indexed pages are the root pages whose robots tag allows indexing.
const pages = readdirSync(new URL('..', import.meta.url))
  .filter((file) => file.endsWith('.html'))
  .map((file) => ({ file, html: read(file) }))
  .filter(({ html }) => /<meta name="robots" content="index/.test(html));
const canonicals = pages.map(({ html }) => attr(html, /<link rel="canonical" href="([^"]+)"/));
const sitemapLine = attr(read('robots.txt'), /^Sitemap: (\S+)$/m);
const locs = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => loc);

for (const { file, html } of pages) {
  test(`${file} has a canonical URL, Open Graph URL and image, and favicon`, () => {
    const canonical = attr(html, /<link rel="canonical" href="([^"]+)"/);
    const ogUrl = attr(html, /<meta property="og:url" content="([^"]+)"/);
    const ogImage = attr(html, /<meta property="og:image" content="([^"]+)"/);
    assert.ok(canonical && ogUrl && ogImage, 'missing canonical, og:url or og:image');
    assert.equal(new URL(canonical).pathname, file === 'index.html' ? '/' : `/${file}`);
    assert.equal(ogUrl, canonical);
    assert.ok(
      existsSync(new URL(`..${new URL(ogImage).pathname}`, import.meta.url)),
      `og:image ${ogImage} has no file`,
    );
    const icon = attr(html, /<link rel="icon" href="([^"]+)"/);
    assert.ok(icon && existsSync(new URL(`../${icon}`, import.meta.url)), 'missing favicon link or file');
  });
}

test('robots.txt names the sitemap', () => assert.ok(sitemapLine));

test('sitemap.xml lists exactly the indexed pages', () => assert.deepEqual([...locs].sort(), [...canonicals].sort()));

test('pages, robots.txt and sitemap.xml share one origin', () => {
  const ogImages = pages.map(({ html }) => attr(html, /<meta property="og:image" content="([^"]+)"/));
  const urls = [...canonicals, ...ogImages, sitemapLine, ...locs].filter(Boolean);
  assert.equal(new Set(urls.map((url) => new URL(url).origin)).size, 1);
});

test('every indexed page has the same contact address', () => {
  const addresses = pages.map(({ html }) => attr(html, /href="mailto:([^"]+)"/));
  assert.ok(addresses.every(Boolean), 'a page has no contact address');
  assert.equal(new Set(addresses).size, 1);
});

// editor.js writes every invite field to the form control of the same name; it generates the accent swatches into #swatches.
test('editor.html has a control for every invite field', () => {
  const editor = read('editor.html');
  const missing = EDITABLE.filter((f) => {
    const control = f === 'accent' ? /id="swatches"/ : new RegExp(`<(input|textarea|select)\\b[^>]*\\bname="${f}"`);
    return !control.test(editor);
  });
  assert.deepEqual(missing, []);
});

// renderInvite gives each card a frame-<frame> and a font-<titleFont> class, styled only in css/styles.css.
const styles = read('css/styles.css');
test('css/styles.css styles every template frame and title font', () => {
  const missing = TEMPLATES.flatMap((t) => [`.frame-${t.frame} `, `.font-${t.titleFont} `])
    .filter((rule) => !styles.includes(rule))
    .map((rule) => rule.trim());
  assert.deepEqual([...new Set(missing)], []);
});

// A custom property that refers to itself is invalid, and every rule using it falls back to transparent or inherited color.
test('no CSS custom property refers to itself', () => {
  const selfReferring = [...styles.matchAll(/(--[\w-]+):([^;]+);/g)]
    .filter(([, name, value]) => value.includes(`var(${name})`))
    .map(([, name]) => name);
  assert.deepEqual(selfReferring, []);
});

// landing.js writes the template and accent counts; the HTML text is what shows before it runs.
test('index.html shows the template and accent counts that landing.js writes', () => {
  const index = read('index.html');
  assert.equal(attr(index, /id="templateCount">([^<]*)</), String(TEMPLATES.length));
  assert.equal(attr(index, /id="accentCount">([^<]*)</), String(ACCENTS.length));
});
