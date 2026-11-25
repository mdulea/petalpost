// Checks the pages, sitemap, generated page regions, local server and site build against production rules.
// Run: pnpm exec node tests/check-site.js
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer as createNetServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildSite } from '../scripts/build.js';
import { startServer } from '../scripts/server.js';
import { CATEGORY_LABELS, ROUTE_PAIRS, alternatesFor, canonicalPath, fileLang } from '../public/js/i18n.js';
import { EDITABLE } from '../public/js/invite.js';
import { TEMPLATES, categoriesFor, linkPreviewPath } from '../public/js/templates.js';
import { OCCASIONS } from '../scripts/occasions.js';
import { OCCASIONS_RO } from '../scripts/occasions-ro.js';
import {
  OCCASIONS_BY_LANG,
  ORIGIN,
  breadcrumb,
  contentFingerprint,
  nextLedger,
  generatePages,
  structuredData,
} from '../scripts/pages.js';

const read = (file) => readFileSync(new URL(`../public/${file}`, import.meta.url), 'utf8');
const attr = (html, pattern) => (html.match(pattern) || [])[1];

const allHtmlFiles = [
  ...readdirSync(new URL('../public/', import.meta.url)).filter((file) => file.endsWith('.html')),
  ...readdirSync(new URL('../public/ro', import.meta.url))
    .filter((file) => file.endsWith('.html'))
    .map((file) => `ro/${file}`),
];

// Indexed pages are the root and ro/ pages whose robots tag allows indexing.
const pages = allHtmlFiles
  .map((file) => ({ file, html: read(file) }))
  .filter(({ html }) => /<meta name="robots" content="index/.test(html));
const canonicals = pages.map(({ html }) => attr(html, /<link rel="canonical" href="([^"]+)"/));
const sitemapLine = attr(read('robots.txt'), /^Sitemap: (\S+)$/m);
const locs = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => loc);

const parseAlternates = (html) =>
  [...html.matchAll(/<link\b[^>]*\brel="alternate"[^>]*>/g)].map((tag) => ({
    hreflang: attr(tag[0], /\bhreflang="([^"]+)"/),
    href: attr(tag[0], /\bhref="([^"]+)"/),
  }));

for (const { file, html } of pages) {
  test(`${file} has matching html lang, canonical URL, hreflang alternates, Open Graph URL and image, and favicon`, () => {
    assert.equal(attr(html, /<html lang="([^"]+)"/), fileLang(file));
    const canonical = attr(html, /<link rel="canonical" href="([^"]+)"/);
    const ogUrl = attr(html, /<meta property="og:url" content="([^"]+)"/);
    const ogImage = attr(html, /<meta property="og:image" content="([^"]+)"/);
    assert.ok(canonical && ogUrl && ogImage, 'missing canonical, og:url or og:image');
    assert.equal(new URL(canonical).pathname, canonicalPath(file));
    assert.equal(ogUrl, canonical);
    assert.deepEqual(parseAlternates(html), alternatesFor(file, ORIGIN));
    assert.ok(
      existsSync(new URL(`../public${new URL(ogImage).pathname}`, import.meta.url)),
      `og:image ${ogImage} has no file`,
    );
    const icon = attr(html, /<link rel="icon" href="([^"]+)"/);
    const iconPath = icon ? new URL(icon, `http://site/${file}`).pathname.slice(1) : '';
    assert.ok(icon && existsSync(new URL(`../public/${iconPath}`, import.meta.url)), 'missing favicon link or file');
  });
}

test('every hreflang alternate points to an indexed page with a reciprocal link back', () => {
  const byUrl = new Map(
    pages.map(({ file, html }) => [attr(html, /<link rel="canonical" href="([^"]+)"/), { file, html }]),
  );
  for (const { file, html } of pages) {
    const selfUrl = attr(html, /<link rel="canonical" href="([^"]+)"/);
    for (const { hreflang, href } of parseAlternates(html)) {
      const target = byUrl.get(href);
      assert.ok(target, `${file} hreflang=${hreflang} points to unknown page ${href}`);
      const backLinks = parseAlternates(target.html).map((a) => a.href);
      assert.ok(backLinks.includes(selfUrl), `${target.file} lacks reciprocal hreflang back to ${selfUrl}`);
    }
  }
});

test('robots.txt names the sitemap', () => assert.ok(sitemapLine));

test('sitemap.xml lists exactly the indexed pages', () => assert.deepEqual([...locs].sort(), [...canonicals].sort()));

// Google ignores lastmod dates that move without content changes, so a page's date moves only with its own text.
const page = (main, footer) =>
  `<html><head><!-- generated:hreflang --><link rel="alternate" /><!-- /generated:hreflang --></head><body><main>${main}</main>
<!-- generated:footer --><footer>${footer}</footer><!-- /generated:footer --></body></html>`;

test('a change inside a generated region or in whitespace keeps the content fingerprint', () => {
  const base = contentFingerprint(page('<p>Hello</p>', '<a href="/about.html">About</a>'));
  assert.equal(contentFingerprint(page('<p>Hello</p>', '<a href="/about.html">About</a><a href="/ro/">RO</a>')), base);
  assert.equal(contentFingerprint(page('<p>\n  Hello\n</p>', '<a href="/about.html">About</a>')), base);
  assert.notEqual(contentFingerprint(page('<p>Hello, guests</p>', '<a href="/about.html">About</a>')), base);
});

test('nextLedger keeps an unchanged date, dates a changed or new page today and drops a removed page', () => {
  const ledger = {
    'about.html': { lastmod: '2026-01-02', fingerprint: 'a' },
    'terms.html': { lastmod: '2026-01-03', fingerprint: 't' },
    'gone.html': { lastmod: '2026-01-04', fingerprint: 'g' },
  };
  const fingerprints = new Map([
    ['terms.html', 't2'],
    ['about.html', 'a'],
    ['new.html', 'n'],
  ]);
  assert.deepEqual(nextLedger(fingerprints, ledger, '2026-05-06'), {
    'about.html': { lastmod: '2026-01-02', fingerprint: 'a' },
    'new.html': { lastmod: '2026-05-06', fingerprint: 'n' },
    'terms.html': { lastmod: '2026-05-06', fingerprint: 't2' },
  });
});

// Google trusts lastmod only when it is a real date, so each URL needs one that is not in the future.
test('every sitemap.xml URL has a lastmod date that is not in the future', () => {
  const urls = [...read('sitemap.xml').matchAll(/<url>([\s\S]*?)<\/url>/g)].map(([, url]) => url);
  const invalid = urls.filter((url) => {
    const lastmod = attr(url, /<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/);
    return !lastmod || Number.isNaN(Date.parse(lastmod)) || Date.parse(lastmod) > Date.now();
  });
  assert.deepEqual(invalid, []);
});

// Link previews show the og: copies, and search results show the title and meta description.
test('every indexed page has an og:title equal to its title and an og:description equal to its description', () => {
  const copies = {
    'og:title': [/<meta\s+property="og:title"\s+content="([^"]+)"/, /<title>([^<]+)<\/title>/],
    'og:description': [
      /<meta\s+property="og:description"\s+content="([^"]+)"/,
      /<meta\s+name="description"\s+content="([^"]+)"/,
    ],
  };
  const mismatched = pages.flatMap(({ file, html }) =>
    Object.entries(copies)
      .map(([name, [copy, source]]) => [name, attr(html, copy), attr(html, source)])
      .filter(([, copy, source]) => !copy || copy !== source)
      .map(([name]) => `${file}: ${name}`),
  );
  assert.deepEqual(mismatched, []);
});

test('indexed pages have distinct titles and descriptions and one h1 each', () => {
  const titles = pages.map(({ html }) => attr(html, /<title>([^<]+)<\/title>/));
  const descriptions = pages.map(({ html }) => attr(html, /<meta\s+name="description"\s+content="([^"]+)"/));
  assert.equal(new Set(titles).size, pages.length, `titles: ${titles}`);
  assert.equal(new Set(descriptions.filter(Boolean)).size, pages.length, 'a description is missing or repeated');
  assert.deepEqual(
    pages.filter(({ html }) => (html.match(/<h1\b/g) || []).length !== 1).map(({ file }) => file),
    [],
  );
});

// vercel.json redirects /index.html to / and /ro/index.html to /ro/, so no page links to either redirect.
test('no page links to index.html or /ro/index.html', () => {
  assert.deepEqual(
    allHtmlFiles.filter((file) => /href="(?:\/|\/ro\/)?index\.html/.test(read(file))),
    [],
  );
});

// Google finds and ranks a page by the links to it; a page only in the sitemap is an orphan.
test('every indexed page but the home pages is linked from at least two other indexed pages', () => {
  const resolveTarget = (fromFile, href) => {
    if (!href || /^[a-z]+:/i.test(href) || href.startsWith('#')) return null;
    const pathname = new URL(href, `http://site/${fromFile}`).pathname;
    if (pathname.endsWith('/')) return `${pathname.slice(1)}index.html`;
    return pathname.slice(1);
  };
  const linkedFrom = (target) =>
    pages.filter(({ file, html }) => {
      if (file === target) return false;
      const hrefs = [...html.matchAll(/<a\b[^>]*\bhref="([^"#?]*)/g)].map(([, href]) => resolveTarget(file, href));
      return hrefs.includes(target);
    }).length;
  assert.deepEqual(
    pages
      .filter(({ file }) => file !== 'index.html' && file !== 'ro/index.html')
      .filter(({ file }) => linkedFrom(file) < 2)
      .map(({ file }) => file),
    [],
  );
});

// The Romanian-only comparison guide has no English pair to link to it, so every Romanian footer lists all Romanian guides.
test("every Romanian page's footer Guides list links to every Romanian guide", () => {
  const guides = [
    '/ro/text-invitatii.html',
    '/ro/cand-sa-trimiti-invitatiile.html',
    '/ro/invitatii-digitale-sau-tiparite.html',
  ];
  const missing = allHtmlFiles
    .filter((file) => fileLang(file) === 'ro')
    .flatMap((file) => {
      const group = attr(read(file), /<p class="footer-title">Ghiduri<\/p>([\s\S]*?)<\/div>/) ?? '';
      return guides.filter((href) => !group.includes(`href="${href}"`)).map((href) => `${file}: ${href}`);
    });
  assert.deepEqual(missing, []);
});

test('every English and Romanian occasion has page text and all page text names an occasion', () => {
  assert.deepEqual(Object.keys(OCCASIONS).sort(), [...categoriesFor('en')].sort());
  assert.deepEqual(Object.keys(OCCASIONS_RO).sort(), [...categoriesFor('ro')].sort());
});

test("each language's category labels name exactly that language's categories", () => {
  for (const lang of ['en', 'ro']) {
    assert.deepEqual(Object.keys(CATEGORY_LABELS[lang]).sort(), [...categoriesFor(lang)].sort(), lang);
  }
});

// pnpm pages writes an occasion page in full from its occasion copy, and only occasionPage writes the occasion-guide
// block. A hand-written page with that block would look generated, but pnpm pages would never rewrite it.
test("the pages that pnpm pages generates in full are each language's occasion pages", () => {
  for (const [lang, occasions] of Object.entries(OCCASIONS_BY_LANG)) {
    assert.deepEqual(
      allHtmlFiles.filter((file) => fileLang(file) === lang && /class="prose occasion-guide"/.test(read(file))).sort(),
      Object.values(occasions)
        .map((o) => o.file)
        .sort(),
      lang,
    );
  }
});

// A list is in the bold-label format when its items start with a bold label.
const lists = (html) =>
  [...html.matchAll(/<ul\b[^>]*>([\s\S]*?)<\/ul>/g)].map(([, body]) =>
    [...body.matchAll(/<li\b[^>]*>\s*([\s\S]*?)<\/li>/g)].map(([, item]) => item),
  );

test('each English and Romanian occasion page has exactly one list, all of it, in the bold-label format', () => {
  for (const occasions of Object.values(OCCASIONS_BY_LANG)) {
    for (const { file } of Object.values(occasions)) {
      const labelled = lists(read(file)).filter((items) => items.some((item) => item.startsWith('<strong>')));
      assert.equal(labelled.length, 1, file);
      assert.ok(
        labelled[0].every((item) => item.startsWith('<strong>')),
        `${file} mixes bold-label and plain items in one list`,
      );
    }
  }
});

test('index.html and ro/index.html say "No account" once, in the hero subtitle, and ro/index.html keeps it in its descriptions', () => {
  for (const [file, phrase] of [
    ['index.html', 'no account'],
    ['ro/index.html', 'fără cont'],
  ]) {
    const html = read(file);
    const body = html.slice(html.indexOf('<body'));
    assert.equal(body.toLowerCase().split(phrase).length - 1, 1, file);
    assert.ok(
      attr(body, /<p class="lead">([\s\S]*?)<\/p>/)
        .toLowerCase()
        .includes(phrase),
      file,
    );
  }
  // The og:description check above keeps the Open Graph copy equal to this description.
  assert.match(attr(read('ro/index.html'), /<meta\s+name="description"\s+content="([^"]+)"/), /fără cont/);
});

test('no page says "al cui este ziua"', () => {
  assert.deepEqual(
    allHtmlFiles.filter((file) => read(file).includes('al cui este ziua')),
    [],
  );
});

// The search phrases from issue #27, as case-insensitive stems. The ro/index.html title, description and lead together
// hold all of them, and each Romanian occasion description holds at least one.
const RO_SEARCH_PHRASES = ['gratuit', 'online', 'whatsapp', 'confirmare'];

test('ro/index.html title, description and lead together use every Romanian search phrase', () => {
  const html = read('ro/index.html');
  const text = [
    attr(html, /<title>([^<]+)<\/title>/),
    attr(html, /<meta\s+name="description"\s+content="([^"]+)"/),
    attr(html, /<p class="lead">([\s\S]+?)<\/p>/),
  ]
    .join(' ')
    .toLowerCase();
  assert.deepEqual(
    RO_SEARCH_PHRASES.filter((phrase) => !text.includes(phrase)),
    [],
  );
});

// JSON-LD blocks per page, parsed; a block that does not parse fails every check that reads it.
const parseJsonLd = (html) =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(([, json]) => JSON.parse(json));
const ofType = (html, type) => parseJsonLd(html).filter((data) => data['@type'] === type);
const text = (html) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
const canonicalOf = (html) => attr(html, /<link rel="canonical" href="([^"]+)"/);
const homeRoute = ROUTE_PAIRS.find((pair) => pair.key === 'home');
const HOMES = { en: homeRoute.en, ro: homeRoute.ro };
const breadcrumbFiles = [
  ...Object.values(OCCASIONS).map((o) => o.file),
  ...Object.values(OCCASIONS_RO).map((o) => o.file),
  ...ROUTE_PAIRS.filter((pair) => pair.guide).flatMap((pair) => [pair.en, pair.ro].filter(Boolean)),
];

test('every page JSON-LD block parses', () => {
  for (const file of allHtmlFiles) assert.doesNotThrow(() => parseJsonLd(read(file)), file);
});

for (const [lang, file] of Object.entries(HOMES)) {
  test(`${file} emits one WebApplication describing Petalpost as a free web app`, () => {
    const html = read(file);
    assert.deepEqual(ofType(html, 'WebApplication'), [
      {
        '@context': 'https://schema.org',
        '@type': 'WebApplication',
        name: 'Petalpost',
        url: canonicalOf(html),
        inLanguage: lang,
        description: attr(html, /<meta\s+name="description"\s+content="([^"]+)"/),
        applicationCategory: 'LifestyleApplication',
        operatingSystem: 'Web',
        offers: { '@type': 'Offer', price: '0', priceCurrency: lang === 'ro' ? 'RON' : 'USD' },
      },
    ]);
  });
}

for (const file of breadcrumbFiles) {
  test(`${file} emits a breadcrumb from its home page to its heading`, () => {
    const html = read(file);
    const home = read(HOMES[fileLang(file)]);
    const crumbs = ofType(html, 'BreadcrumbList');
    assert.equal(crumbs.length, 1);
    assert.deepEqual(
      crumbs[0].itemListElement.map(({ position, name, item }) => ({ position, name, item })),
      [
        { position: 1, name: fileLang(file) === 'ro' ? 'Acasă' : 'Home', item: canonicalOf(home) },
        { position: 2, name: text(attr(html, /<h1\b[^>]*>([\s\S]*?)<\/h1>/)), item: canonicalOf(html) },
      ],
    );
  });
}

// Copy that would close the JSON-LD script element early if it reached the page unescaped.
const SCRIPT_CLOSE = 'Free </script><script>alert(1)</script>';

test('a home page description containing </script> stays inside its JSON-LD block', () => {
  const block = structuredData(HOMES.en, `<meta name="description" content="${SCRIPT_CLOSE}" />`);
  const [, json] = block.match(/^<script type="application\/ld\+json">([\s\S]*)<\/script>$/);
  assert.ok(json.includes('\\u003c/script>'), block);
  assert.ok(!json.includes('<'), block);
  assert.equal(JSON.parse(json).description, SCRIPT_CLOSE);
});

test('an occasion or guide heading containing </script> fails instead of reaching a breadcrumb', () => {
  const occasion = Object.values(OCCASIONS)[0];
  assert.throws(
    () => breadcrumb('en', SCRIPT_CLOSE, `${ORIGIN}${canonicalPath(occasion.file)}`),
    /is not plain text/,
    occasion.file,
  );
  const guide = ROUTE_PAIRS.find((pair) => pair.guide).en;
  assert.throws(() => structuredData(guide, `<h1>${SCRIPT_CLOSE}</h1>`), /is not plain text/, guide);
});

test('only occasion pages and guides emit a breadcrumb', () => {
  assert.deepEqual(
    allHtmlFiles.filter((file) => !breadcrumbFiles.includes(file) && ofType(read(file), 'BreadcrumbList').length),
    [],
  );
});

test('every Romanian occasion description uses a Romanian search phrase', () => {
  assert.deepEqual(
    Object.values(OCCASIONS_RO)
      .filter((o) => !RO_SEARCH_PHRASES.some((phrase) => o.description.toLowerCase().includes(phrase)))
      .map((o) => o.file),
    [],
  );
});

test('no page emits an FAQ, a rating or a review', () => {
  const types = (data) =>
    typeof data === 'object' && data !== null
      ? [data['@type'], ...Object.values(data).flatMap(types)].filter(Boolean)
      : [];
  const banned = ['FAQPage', 'AggregateRating', 'Rating', 'Review'];
  assert.deepEqual(
    allHtmlFiles.filter((file) =>
      parseJsonLd(read(file))
        .flatMap(types)
        .some((type) => banned.includes(type)),
    ),
    [],
  );
});

for (const [file, content] of await generatePages()) {
  test(`${file} matches the output of pnpm pages`, () =>
    assert.equal(readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'), content, 'run pnpm pages'));
}

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

// The privacy page promises no cookies and nothing loaded from a third party. The only absolute source is
// Vercel's /_vercel/insights/script.js, which has a root-relative address. Adding a tracker that reads or writes on the
// device needs a consent banner first (ePrivacy Art. 5(3)).
test('no page loads a resource from another origin', () => {
  const external = allHtmlFiles.flatMap((file) =>
    [
      ...read(file).matchAll(
        /<(?:script|img|iframe)\b[^>]*\bsrc="(https?:\/\/|\/\/)[^"]*"|<link\b[^>]*\brel="(?:stylesheet|preload|icon)"[^>]*\bhref="(?:https?:\/\/|\/\/)[^"]*"/g,
      ),
    ].map(([tag]) => `${file}: ${tag}`),
  );
  assert.deepEqual(external, []);
});

test('no script writes a cookie', () => {
  const writers = readdirSync(new URL('../public/js', import.meta.url)).filter(
    (file) => file.endsWith('.js') && /document\.cookie|cookieStore/.test(read(`js/${file}`)),
  );
  assert.deepEqual(writers, []);
});

// editor.js writes every invite field to the form control of the same name; it generates the accent swatches into #swatches.
for (const file of ['editor.html', 'ro/editor.html']) {
  test(`${file} has a control for every invite field`, () => {
    const editor = read(file);
    const missing = EDITABLE.filter((f) => {
      const control = f === 'accent' ? /id="swatches"/ : new RegExp(`<(input|textarea|select)\\b[^>]*\\bname="${f}"`);
      return !control.test(editor);
    });
    assert.deepEqual(missing, []);
  });
}

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

// Browsers report safe-area insets only under viewport-fit=cover, and no test browser has a notch or home indicator,
// so this checks the rules that keep content and the Preview button clear of them.
test('every page extends under the notch and keeps its content and Preview button clear of it', () => {
  const withoutCover = allHtmlFiles.filter(
    (file) => !/<meta name="viewport" content="[^"]*viewport-fit=cover/.test(read(file)),
  );
  assert.deepEqual(withoutCover, []);
  // The declarations of every rule for the selector, at the top level or indented in a media query, joined.
  const rule = (selector) =>
    styles
      .split(new RegExp(`\\n *${selector.replace('.', '\\.')} \\{`))
      .slice(1)
      .map((block) => block.split('}')[0])
      .join('');
  assert.match(rule('body'), /padding-left: env\(safe-area-inset-left\)/);
  assert.match(rule('body'), /padding-right: env\(safe-area-inset-right\)/);
  assert.match(rule('.jump-preview'), /bottom: calc\([^;]*env\(safe-area-inset-bottom\)/);
  assert.match(rule('.jump-preview'), /right: calc\([^;]*env\(safe-area-inset-right\)/);
});

// Desktop WebKit in Playwright does not reproduce iOS Safari's native date and time minimum width,
// so this checks the iOS-scoped rule that keeps both controls inside their field-row column.
test('css/styles.css removes native appearance from date and time inputs on iOS', () => {
  const iosBlock = styles.match(/@supports\s*\(-webkit-touch-callout:\s*none\)\s*\{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(iosBlock, /\.input\[type='date'\]/);
  assert.match(iosBlock, /\.input\[type='time'\]/);
  assert.match(iosBlock, /-webkit-appearance:\s*none/);
  assert.match(iosBlock, /(?:^|[;\s])appearance:\s*none/m);
});

test('every page starts with a skip link to its main element', () => {
  const missing = allHtmlFiles.filter((file) => {
    const html = read(file);
    return !/<body>\s*<a class="skip-link" href="#main">/.test(html) || !/<main[^>]* id="main"/.test(html);
  });
  assert.deepEqual(missing, []);
});

// The hero keeps today's pick and the occasion chips without a statistics widget, and the steps lead with their CSS
// numerals instead of icon tiles.
test('index.html and ro/index.html show no hero statistics and no step icon tiles', () => {
  for (const file of ['index.html', 'ro/index.html']) {
    const index = read(file);
    const hero = index.slice(index.indexOf('<aside class="hero-side"'), index.indexOf('</aside>'));
    assert.match(hero, /id="todaysPick"/, file);
    assert.match(hero, /class="chips"/, file);
    assert.doesNotMatch(hero, /class="stat|id="templateCount"|id="accentCount"/, file);
    const steps = index.slice(
      index.indexOf('<ol class="steps"'),
      index.indexOf('</ol>', index.indexOf('<ol class="steps"')),
    );
    assert.equal((steps.match(/<li class="step">/g) ?? []).length, 3, file);
    assert.doesNotMatch(steps, /feature-icon|<svg/, file);
  }
});

// vendor/ stays byte-for-byte as published. Replacing the library means updating this hash and THIRD_PARTY_NOTICES.txt.
test('vendor/html-to-image.js is the published html-to-image 1.11.11 dist/html-to-image.js', () => {
  const bytes = readFileSync(new URL('../public/vendor/html-to-image.js', import.meta.url));
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    '0181b9a4ea3351540751b2e72b6baecb5c2297093fcb0bd2af94fc531cb0fbda',
  );
});

// scripts/server.js runs pnpm dev and the browser checks in place of Vercel, so it must answer like production:
// the vercel.json headers on every path, / and /ro/ as index.html, no clean URLs, no directory listing, 404.html for
// unknown paths, no dotfiles, no file outside public/, /api paths through the API and /e/{id} or
// /ro/e/{id} through the dynamic event page.
// The first test that needs the server starts it, so it listens only after every top-level line has run, and a run
// filtered to other tests never starts it. A server started at top level kept the process alive when a later top-level
// line threw. A server started in a before hook kept a filtered run alive, because the after hook ran before it listened.
let localServer;
const localUrl = async () => (await (localServer ??= startServer({ port: 0, memory: true }))).url;
after(async () => (await localServer)?.close());
const fetchLocal = async (path) => fetch(new URL(path, await localUrl()), { redirect: 'manual' });

// Another worktree's server, or any other program, can hold the port. The server then refuses to start instead of
// leaving the browser checks to test that program.
const holdPort = async () => {
  const holder = createNetServer();
  await new Promise((done) => holder.listen(0, 'localhost', () => done(undefined)));
  return { holder, port: /** @type {import('node:net').AddressInfo} */ (holder.address()).port };
};
const portInUseMessage = (port) => new RegExp(`port ${port}\\b.*BROWSER_CHECK_PORT`, 's');

test('startServer rejects a port in use with a message naming the port and the browser-check port variable', async () => {
  const { holder, port } = await holdPort();
  try {
    await assert.rejects(startServer({ port, memory: true }), { message: portInUseMessage(port) });
  } finally {
    holder.close();
  }
});

test('the server command exits with a non-zero status and the same message on a port in use', async () => {
  const { holder, port } = await holdPort();
  try {
    const server = fileURLToPath(new URL('../scripts/server.js', import.meta.url));
    const { code, stderr } = await new Promise((done) => {
      execFile(process.execPath, [server, '--port', String(port), '--memory'], (error, _stdout, stderr) =>
        done({ code: error?.code ?? 0, stderr }),
      );
    });
    assert.notEqual(code, 0);
    assert.match(stderr, portInUseMessage(port));
  } finally {
    holder.close();
  }
});
const vercelHeaders = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')).headers.flatMap(
  (rule) => rule.headers,
);

for (const path of [
  '/',
  '/editor.html',
  '/ro/',
  '/ro/editor.html',
  '/css/styles.css',
  '/missing.html',
  `/api/events/${'A'.repeat(22)}`,
  `/e/${'A'.repeat(22)}`,
  `/ro/e/${'A'.repeat(22)}`,
]) {
  test(`the local server sends the vercel.json headers on ${path}`, async () => {
    const response = await fetchLocal(path);
    assert.deepEqual(
      vercelHeaders.filter(({ key, value }) => response.headers.get(key) !== value).map(({ key }) => key),
      [],
    );
  });
}

test('the local server answers / and /ro/ with their index.html and pages by their file names', async () => {
  const responses = await Promise.all(['/', '/editor.html', '/ro/', '/ro/invitatii-botez.html'].map(fetchLocal));
  assert.deepEqual(await Promise.all(responses.map(async (r) => [r.status, await r.text()])), [
    [200, read('index.html')],
    [200, read('editor.html')],
    [200, read('ro/index.html')],
    [200, read('ro/invitatii-botez.html')],
  ]);
});

const nonSitePaths = [
  '/package.json',
  '/server/api.js',
  '/server/migrations/001_rsvp.sql',
  '/scripts/build.js',
  '/README.md',
];
for (const path of [
  '/editor',
  '/ro/editor',
  '/css/',
  '/.gitignore',
  '/.git/HEAD',
  '/scripts/../.env.local',
  ...nonSitePaths,
]) {
  test(`the local server answers ${path} with 404.html`, async () => {
    const response = await fetchLocal(path);
    assert.deepEqual([response.status, await response.text()], [404, read('404.html')]);
  });
}

for (const [from, to] of [
  ['/index.html?t=wedding', '/?t=wedding'],
  ['/ro?t=botez-porumbel', '/ro/?t=botez-porumbel'],
  ['/ro/index.html?t=botez-porumbel', '/ro/?t=botez-porumbel'],
]) {
  test(`the local server redirects ${from} to ${to} like vercel.json`, async () => {
    const response = await fetchLocal(from);
    assert.deepEqual([response.status, response.headers.get('location')], [301, to]);
  });
}

test('the local server routes /api paths to the API', async () => {
  const response = await fetchLocal(`/api/events/${'A'.repeat(22)}`);
  assert.deepEqual(
    [response.status, response.headers.get('cache-control'), await response.json()],
    [404, 'no-store', { error: 'This invitation does not exist. It may have been deleted.' }],
  );
});

test('the local server serves /e/{id} with dynamic OG metadata for published events and 404 when missing', async () => {
  const missing = await fetchLocal(`/e/${'A'.repeat(22)}`);
  assert.equal(missing.status, 404);
  assert.equal(missing.headers.get('cache-control'), 'no-store');
  assert.match(await missing.text(), /<meta name="robots" content="noindex, nofollow" \/>/);

  const id = 'B'.repeat(22);
  const put = await fetch(new URL(`/api/events/${id}`, await localUrl()), {
    method: 'PUT',
    headers: { authorization: `Bearer ${'s'.repeat(43)}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      t: 'birthday',
      d: {
        eyebrow: "You're invited to",
        title: 'Zoe turns 30',
        hosts: 'Join Zoe',
        date: '2026-12-12',
        time: '14:00',
        venue: 'Willow Park',
        address: '24 Willow Lane',
        message: 'Cake and games.',
        rsvp: 'Reply soon',
        accent: null,
      },
    }),
  });
  assert.equal(put.status, 201);

  const page = await fetchLocal(`/e/${id}`);
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.match(html, /<meta property="og:title" content="Zoe turns 30 \| Petalpost" \/>/);
  assert.match(
    html,
    /<meta property="og:description" content="Saturday, December 12, 2026 at 2:00 PM · Willow Park" \/>/,
  );
});

// Vercel serves only the buildSite output, so the pages must find in it every file they load.
const outDir = mkdtempSync(join(tmpdir(), 'petalpost-build-'));
after(() => rmSync(outDir, { recursive: true, force: true }));
buildSite(outDir);
const built = readdirSync(outDir, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => relative(outDir, join(entry.parentPath, entry.name)).split(sep).join('/'));

// The same-origin paths a built file loads or links to, resolved against the file's own path.
const references = (file) => {
  const text = readFileSync(join(outDir, file), 'utf8');
  const urls = file.endsWith('.html')
    ? [
        ...[...text.matchAll(/\b(?:src|href)="([^"]+)"/g)].map(([, url]) => url),
        ...[...text.matchAll(/<meta property="og:image" content="([^"]+)"/g)].map(([, url]) => new URL(url).pathname),
      ]
    : file.endsWith('.css')
      ? [...text.matchAll(/url\(([^)'"]+)\)/g)].map(([, url]) => url)
      : [...text.matchAll(/^import (?:[^'"]+ from )?'([^']+)'/gm)].map(([, url]) => url);
  return urls
    .filter((url) => !/^[a-z]+:/.test(url) && !url.startsWith('#') && !url.startsWith('/_vercel/'))
    .map((url) => new URL(url, `http://site/${file}`).pathname.slice(1))
    .map((path) => (!path || path.endsWith('/') ? `${path}index.html` : path));
};

test('the build contains every English and Romanian page and every file the built pages load or link to', () => {
  const seen = new Set();
  const queue = [...allHtmlFiles];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    if (built.includes(file) && /\.(html|css|js)$/.test(file)) queue.push(...references(file));
  }
  assert.deepEqual([...seen].filter((file) => !built.includes(file)).sort(), []);
});

// The width and height of a JPEG, read from its first start-of-frame segment, or null when it has none.
const jpegSize = (bytes) => {
  for (let i = 2; i + 9 < bytes.length; i += 2 + bytes.readUInt16BE(i + 2)) {
    if (bytes[i] !== 0xff) return null;
    if (bytes[i + 1] >= 0xc0 && bytes[i + 1] <= 0xc3) return [bytes.readUInt16BE(i + 7), bytes.readUInt16BE(i + 5)];
  }
  return null;
};

// Messaging apps drop link preview images over 300 KB, and Vercel serves only the buildSite output.
test('every template has a 1200 by 630 JPEG link preview image under 300 KB in public/ and in the build', () => {
  const problems = TEMPLATES.flatMap(({ id }) => {
    const path = linkPreviewPath(id);
    const file = fileURLToPath(new URL(`../public/${path}`, import.meta.url));
    if (!existsSync(file)) return [`${path} is missing; run pnpm previews`];
    const bytes = readFileSync(file);
    return [
      ...(bytes.length >= 300 * 1024 ? [`${path} is ${bytes.length} bytes, over 300 KB`] : []),
      ...(bytes[0] === 0xff && bytes[1] === 0xd8 && String(jpegSize(bytes)) === '1200,630'
        ? []
        : [`${path} is not a 1200 by 630 JPEG`]),
      ...(built.includes(path) ? [] : [`${path} is missing from the build`]),
    ];
  });
  assert.deepEqual(problems, []);
});

// Vercel uploads package files, server code, migrations and tooling for the API functions; none of them may be a URL.
test('the build contains no package file, server code, migration, tooling, documentation, dotfile or type declaration', () => {
  const nonSite =
    /^(package\.json|pnpm-[\w-]+\.yaml|node_modules\/.*|(server|migrations|api|scripts|docs)\/.*|(.*\/)?\..*|.*\.d\.ts|.*\.md)$/;
  assert.deepEqual(
    built.filter((file) => nonSite.test(file)),
    [],
  );
});
