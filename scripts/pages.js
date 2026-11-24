// Generates the site HTML that crawlers must read without running JavaScript, from the template catalog,
// scripts/occasions.js and scripts/occasions-ro.js: one page per occasion in English and Romanian, and the
// regions between <!-- generated:NAME --> and <!-- /generated:NAME --> markers in public/ and public/ro/ pages, which
// are the hreflang links, JSON-LD structured data, landing galleries, landing template counts, occasion links and every
// page footer.
// It also writes sitemap.xml with every indexed page and its lastmod date. scripts/lastmod.json keeps each indexed
// page's date with a fingerprint of its content: the page text outside its generated regions, or the occasion copy of
// an occasion page. A page whose fingerprint changed gets today's date, so a change inside a generated region, such as
// a new footer link, leaves every date alone.
// generatePages() resolves a Map from file path relative to the repository root to its content, formatted with
// Prettier; check-site.js fails when a committed file differs from it.
// Run: pnpm pages, which writes the files.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import {
  alternatesFor,
  canonicalPath,
  categoryLabel,
  fileLang,
  languageSwitchHref,
  localeOf,
  routeForFile,
} from '../public/js/i18n.js';
import { CONTACT, editorUrl, makeInviteData } from '../public/js/invite.js';
import { categoriesFor, popularTemplatesFor, renderInvite, templatesFor } from '../public/js/templates.js';
import { OCCASIONS } from './occasions.js';
import { OCCASIONS_RO } from './occasions-ro.js';

const repo = new URL('../', import.meta.url);
const root = new URL('public/', repo);
const LEDGER = 'scripts/lastmod.json';
const read = (file) => readFileSync(new URL(file, root), 'utf8');

// Every absolute URL derives from the index.html canonical, so changing the production origin starts there.
export const ORIGIN = new URL(read('index.html').match(/<link rel="canonical" href="([^"]+)"/)[1]).origin;

export const OCCASIONS_BY_LANG = {
  en: OCCASIONS,
  ro: OCCASIONS_RO,
};

const PAGE_COPY = {
  en: {
    brandLabel: 'Petalpost home',
    skip: 'Skip to content',
    navLabel: 'Main',
    allTemplates: 'All templates',
    allTemplatesHref: '/#templates',
    createInvite: 'Create invite',
    editorHref: '/editor.html',
    startInvite: 'Start your invite',
    popular: 'Popular',
    moreOccasions: 'More occasions',
    moreLead: 'Every design takes your own photo, names, date and address.',
    footerTagline: 'Petalpost. Made for the people you love to gather.',
    footerNavLabel: 'Footer',
    footerOccasions: 'Occasions',
    footerGuides: 'Guides',
    footerGuideLinks: [
      { href: '/invitation-wording.html', label: 'Invitation wording' },
      { href: '/when-to-send-invitations.html', label: 'When to send invitations' },
    ],
    footerSite: 'Petalpost',
    footerHome: { href: '/', label: 'Home' },
    footerEditor: { href: '/editor.html', label: 'Make an invite' },
    footerAbout: { href: '/about.html', label: 'About' },
    footerPrivacy: { href: '/privacy.html', label: 'Privacy' },
    footerTerms: { href: '/terms.html', label: 'Terms' },
    footerContact: 'Contact',
    footerLang: { href: '/ro/', lang: 'ro', label: 'Română' },
    switchShort: 'RO',
    switchLabel: 'Română',
    switchLang: 'ro',
    currency: 'USD',
    ogLocale: 'en_US',
    ogImage: `${ORIGIN}/og-image.png`,
    ogImageAlt: 'Petalpost: three hand-drawn invitation cards beside the words Your day, your invite.',
  },
  ro: {
    brandLabel: 'Petalpost acasă',
    skip: 'Sari la conținut',
    navLabel: 'Navigare principală',
    allTemplates: 'Toate modelele',
    allTemplatesHref: '/ro/#templates',
    createInvite: 'Creează invitație',
    editorHref: '/ro/editor.html',
    startInvite: 'Începe invitația',
    popular: 'Popular',
    moreOccasions: 'Alte ocazii',
    moreLead: 'Fiecare model acceptă fotografia ta, numele, data și adresa.',
    footerTagline: 'Petalpost. Făcut pentru oamenii pe care îi aduni cu drag.',
    footerNavLabel: 'Subsol',
    footerOccasions: 'Ocazii',
    footerGuides: 'Ghiduri',
    footerGuideLinks: [
      { href: '/ro/text-invitatii.html', label: 'Texte pentru invitații' },
      { href: '/ro/cand-sa-trimiti-invitatiile.html', label: 'Când să trimiți invitațiile' },
      { href: '/ro/invitatii-digitale-sau-tiparite.html', label: 'Invitații digitale sau tipărite' },
    ],
    footerSite: 'Petalpost',
    footerHome: { href: '/ro/', label: 'Acasă' },
    footerEditor: { href: '/ro/editor.html', label: 'Creează invitație' },
    footerAbout: { href: '/ro/despre.html', label: 'Despre' },
    footerPrivacy: { href: '/ro/confidentialitate.html', label: 'Confidențialitate' },
    footerTerms: { href: '/ro/termeni.html', label: 'Termeni' },
    footerContact: 'Contact',
    footerLang: { href: '/', lang: 'en', label: 'English' },
    switchShort: 'EN',
    switchLabel: 'English',
    switchLang: 'en',
    currency: 'RON',
    ogLocale: 'ro_RO',
    ogImage: `${ORIGIN}/ro/og-image.png`,
    ogImageAlt: 'Petalpost: trei invitații ilustrate alături de mesajul Ziua ta, invitația ta.',
  },
};

const hreflangLinks = (file) =>
  alternatesFor(file, ORIGIN)
    .map(({ hreflang, href }) => `<link rel="alternate" hreflang="${hreflang}" href="${href}" />`)
    .join('\n    ');

// A JSON-LD block. Its script type makes it a data block that the browser never runs, so script-src 'self' allows it.
// Escaping < keeps a value from closing the script element.
const jsonLd = (data) =>
  `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', ...data }).replace(/</g, '\\u003c')}</script>`;

// Describes Petalpost as a free web application on the home page in lang, under that page's meta description.
const webApplication = (lang, description) =>
  jsonLd({
    '@type': 'WebApplication',
    name: 'Petalpost',
    url: `${ORIGIN}${PAGE_COPY[lang].footerHome.href}`,
    inLanguage: lang,
    description,
    applicationCategory: 'LifestyleApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: PAGE_COPY[lang].currency },
  });

// Two levels: the home page in the page's language, then the page itself under its heading.
// The heading is plain text; markup or an entity would reach crawlers verbatim, so it throws.
const breadcrumb = (lang, heading, url) => {
  if (/[<&]/.test(heading)) throw new Error(`breadcrumb heading "${heading}" is not plain text`);
  return jsonLd({
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: PAGE_COPY[lang].footerHome.label,
        item: `${ORIGIN}${PAGE_COPY[lang].footerHome.href}`,
      },
      { '@type': 'ListItem', position: 2, name: heading, item: url },
    ],
  });
};

// Fills the structured region of a hand-written page: a WebApplication on the home pages, a breadcrumb on the guides.
// It reads the committed meta description or h1, so the JSON-LD repeats the visible text. Any other page throws.
const structuredData = (file, html) => {
  const lang = fileLang(file);
  const route = routeForFile(file);
  if (route?.key === 'home') {
    return webApplication(lang, html.match(/<meta\s+name="description"\s+content="([^"]+)"/)[1]);
  }
  if (route?.guide) {
    const heading = html
      .match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/)[1]
      .replace(/\s+/g, ' ')
      .trim();
    return breadcrumb(lang, heading, `${ORIGIN}${canonicalPath(file)}`);
  }
  throw new Error(`${file} has a structured-data region but is neither a home page nor a guide`);
};

const occasionLinks = (categories, lang) => {
  const occasions = OCCASIONS_BY_LANG[lang];
  return categories
    .map((c) => `<a class="chip-link" href="${canonicalPath(occasions[c].file)}">${categoryLabel(c, lang)}</a>`)
    .join('');
};

const card = (t, lang) => {
  const copy = PAGE_COPY[lang];
  const locale = localeOf(lang);
  const popular = popularTemplatesFor(lang);
  return `
  <article class="card" data-category="${t.category}">
    ${popular.includes(t.id) ? `<span class="badge">${copy.popular}</span>` : ''}
    <div class="card-art">${renderInvite(t, makeInviteData(t, undefined, lang), { decorative: true, locale })}</div>
    <div class="card-body">
      <div>
        <h3><a class="card-link" href="${editorUrl(t.id, lang)}">${t.name}</a></h3>
        <p>${categoryLabel(t.category, lang)}. ${t.tagline}</p>
      </div>
      <span class="card-go" aria-hidden="true"><svg class="icon"><use href="#i-arrow"/></svg></span>
    </div>
  </article>`;
};

// Footer links are root-relative so 404.html and nested /ro/ pages link cleanly to the same destinations.
const footer = (lang) => {
  const copy = PAGE_COPY[lang];
  const categories = categoriesFor(lang);
  const occasions = OCCASIONS_BY_LANG[lang];
  return `
  <footer class="site-footer">
    <p class="footer-tagline">${copy.footerTagline}</p>
    <nav class="footer-nav" aria-label="${copy.footerNavLabel}">
      <div class="footer-group">
        <p class="footer-title">${copy.footerOccasions}</p>
        ${categories.map((c) => `<a href="${canonicalPath(occasions[c].file)}">${occasions[c].heading}</a>`).join('')}
      </div>
      <div class="footer-group">
        <p class="footer-title">${copy.footerGuides}</p>
        ${copy.footerGuideLinks.map(({ href, label }) => `<a href="${href}">${label}</a>`).join('\n')}
      </div>
      <div class="footer-group">
        <p class="footer-title">${copy.footerSite}</p>
        <a href="${copy.footerHome.href}">${copy.footerHome.label}</a>
        <a href="${copy.footerEditor.href}">${copy.footerEditor.label}</a>
        <a href="${copy.footerAbout.href}">${copy.footerAbout.label}</a>
        <a href="${copy.footerPrivacy.href}">${copy.footerPrivacy.label}</a>
        <a href="${copy.footerTerms.href}">${copy.footerTerms.label}</a>
        <a href="mailto:${CONTACT}">${copy.footerContact}</a>
        <a href="${copy.footerLang.href}" hreflang="${copy.footerLang.lang}" lang="${copy.footerLang.lang}">${copy.footerLang.label}</a>
      </div>
    </nav>
  </footer>`;
};

const REGIONS = {
  hreflang: (file) => hreflangLinks(file),
  structured: structuredData,
  gallery: (file) => {
    const lang = fileLang(file);
    return templatesFor(lang)
      .map((t) => card(t, lang))
      .join('');
  },
  occasions: (file) => {
    const lang = fileLang(file);
    return occasionLinks(categoriesFor(lang), lang);
  },
  footer: (file) => footer(fileLang(file)),
  templateCount: (file) => `<span class="stat-number" id="templateCount">${templatesFor(fileLang(file)).length}</span>`,
};

const header = (file, lang) => {
  const copy = PAGE_COPY[lang];
  const switchHref = languageSwitchHref(file);
  return `
  <header class="site-header">
    <a class="brand" href="${copy.footerHome.href}" aria-label="${copy.brandLabel}">
      <svg class="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
        <rect x="4" y="10" width="32" height="22" rx="4" fill="#F9E6E2" stroke="#A9524C" stroke-width="2" />
        <path d="M5 12l15 11 15-11" fill="none" stroke="#A9524C" stroke-width="2" stroke-linejoin="round" />
        <path d="M20 19c-1.6-2.4-5-1.4-5 1.2 0 2.4 5 5.3 5 5.3s5-2.9 5-5.3c0-2.6-3.4-3.6-5-1.2z" fill="#7C9A74" />
      </svg>
      Petalpost
    </a>
    <nav class="nav" aria-label="${copy.navLabel}">
      <a class="pill" href="${copy.allTemplatesHref}"><svg class="icon"><use href="#i-layout" /></svg>${copy.allTemplates}</a>
      <a class="pill pill-lang" href="${switchHref}" hreflang="${copy.switchLang}" lang="${copy.switchLang}" aria-label="${copy.switchLabel}">${copy.switchShort}</a>
      <a class="pill pill-cta" href="${copy.editorHref}"><svg class="icon"><use href="#i-pen" /></svg>${copy.createInvite}</a>
    </nav>
  </header>`;
};

const guideSection = ({ heading, intro = [], paragraphs = [], list, quotes }) => `
  <h2>${heading}</h2>
  ${intro.map((p) => `<p>${p}</p>`).join('')}
  ${list ? `<ul>${list.map((item) => `<li>${item}</li>`).join('')}</ul>` : ''}
  ${quotes ? quotes.map((q) => `<blockquote><p>${q}</p></blockquote>`).join('') : ''}
  ${paragraphs.map((p) => `<p>${p}</p>`).join('')}`;

function occasionPage(category, lang) {
  const copy = PAGE_COPY[lang];
  const o = OCCASIONS_BY_LANG[lang][category];
  const title = `Petalpost | ${o.heading}`;
  const url = `${ORIGIN}${canonicalPath(o.file)}`;
  const templates = templatesFor(lang).filter((t) => t.category === category);
  const others = categoriesFor(lang).filter((c) => c !== category);
  return `<!doctype html>
<html lang="${lang}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${title}</title>
    <meta name="description" content="${o.description}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${url}" />
    <!-- generated:hreflang -->${hreflangLinks(o.file)}<!-- /generated:hreflang -->
    ${breadcrumb(lang, o.heading, url)}
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Petalpost" />
    <meta property="og:locale" content="${copy.ogLocale}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${o.description}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${copy.ogImage}" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="${copy.ogImageAlt}" />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/css/fonts.css" />
    <link rel="stylesheet" href="/css/styles.css" />
  </head>
  <body>
    <a class="skip-link" href="#main">${copy.skip}</a>
    ${header(o.file, lang)}
    <main id="main">
      <section class="section" aria-labelledby="occasion-title">
        <div class="section-head">
          <div>
            <h1 id="occasion-title">${o.heading}</h1>
            <p>${o.lead}</p>
          </div>
          <a class="btn btn-primary" href="${editorUrl(templates[0].id, lang)}"><svg class="icon"><use href="#i-pen" /></svg>${copy.startInvite}</a>
        </div>
        <div class="gallery">${templates.map((t) => card(t, lang)).join('')}</div>
      </section>
      <div class="prose occasion-guide">${o.sections.map(guideSection).join('')}</div>
      <section class="section" aria-labelledby="more-title">
        <div class="section-head">
          <div>
            <h2 id="more-title">${copy.moreOccasions}</h2>
            <p>${copy.moreLead}</p>
          </div>
        </div>
        <div class="chips">${occasionLinks(others, lang)}</div>
      </section>
    </main>
    <!-- generated:footer -->${footer(lang)}<!-- /generated:footer -->
    <script type="module" src="/js/page.js"></script>
    <script src="/js/analytics.js"></script>
    <script defer src="/_vercel/insights/script.js"></script>
  </body>
</html>
`;
}

// A generated region with its markers: the opening marker, the region name and the closing marker are groups 1 to 3.
const GENERATED = /(<!-- generated:(\w+) -->)[\s\S]*?(<!-- \/generated:\2 -->)/g;

// Replaces the content of every known marker region in html. A region reads the file name and the committed html.
const fillRegions = (file, html) =>
  html.replace(GENERATED, (match, open, name, close) =>
    REGIONS[name] ? `${open}${REGIONS[name](file, html)}${close}` : match,
  );

function siteHtmlFiles() {
  const files = readdirSync(root).filter((f) => f.endsWith('.html'));
  const roDir = new URL('ro', root);
  if (existsSync(roDir)) {
    for (const f of readdirSync(roDir).filter((name) => name.endsWith('.html'))) files.push(`ro/${f}`);
  }
  return files;
}

// The fingerprint of a page's content: its text with every generated region emptied, runs of whitespace joined and
// whitespace next to a tag bracket dropped, so neither a generated region nor reformatting changes it.
export const contentFingerprint = (text) => {
  const content = text
    .replace(GENERATED, '$1$3')
    .replace(/\s+/g, ' ')
    .replace(/ ?([<>]) ?/g, '$1');
  return createHash('sha256').update(content).digest('hex').slice(0, 16);
};

// The new ledger from the fingerprint of each indexed page: an unchanged page keeps its date, a changed or new page
// gets today, and a page missing from fingerprints leaves the ledger. Keys are sorted, so the output is stable.
export function nextLedger(fingerprints, ledger, today) {
  const next = {};
  for (const file of [...fingerprints.keys()].sort()) {
    const fingerprint = fingerprints.get(file);
    const lastmod = ledger[file]?.fingerprint === fingerprint ? ledger[file].lastmod : today;
    next[file] = { lastmod, fingerprint };
  }
  return next;
}

// The local calendar date as YYYY-MM-DD.
const localDate = (date = new Date()) =>
  [date.getFullYear(), date.getMonth() + 1, date.getDate()].map((n) => String(n).padStart(2, '0')).join('-');

// The sitemap.xml text for a list of {loc, lastmod} entries, in list order.
const sitemap = (urls) => `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(({ loc, lastmod }) => `  <url><loc>${loc}</loc><lastmod>${lastmod}</lastmod></url>\n`).join('')}</urlset>
`;

export async function generatePages() {
  const raw = new Map();
  // The occasion copy is the content of a generated occasion page.
  const occasionContent = new Map();
  for (const lang of ['en', 'ro']) {
    for (const c of categoriesFor(lang)) {
      const occasion = OCCASIONS_BY_LANG[lang][c];
      raw.set(occasion.file, occasionPage(c, lang));
      occasionContent.set(occasion.file, JSON.stringify(occasion));
    }
  }
  for (const file of siteHtmlFiles().filter((f) => !raw.has(f))) {
    const html = read(file);
    if (html.includes('<!-- generated:')) raw.set(file, fillRegions(file, html));
  }
  const config = await resolveConfig(new URL('index.html', root));
  const pages = new Map();
  for (const [file, html] of raw) pages.set(file, await format(html, { ...config, parser: 'html' }));

  const fingerprints = new Map();
  const locs = new Map();
  for (const file of siteHtmlFiles()) {
    const html = pages.get(file) ?? read(file);
    if (!/<meta name="robots" content="index/.test(html)) continue;
    fingerprints.set(file, contentFingerprint(occasionContent.get(file) ?? html));
    const canonical = html.match(/<link rel="canonical" href="([^"]+)"/);
    if (!canonical)
      throw new Error(`${file} allows indexing but has no canonical link, so the sitemap cannot list it.`);
    locs.set(file, canonical[1]);
  }
  const ledgerUrl = new URL(LEDGER, repo);
  const ledger = nextLedger(
    fingerprints,
    existsSync(ledgerUrl) ? JSON.parse(readFileSync(ledgerUrl, 'utf8')) : {},
    localDate(),
  );
  const urls = [...locs].map(([file, loc]) => ({ loc, lastmod: ledger[file].lastmod }));
  urls.sort((a, b) => (a.loc < b.loc ? -1 : 1));

  const output = new Map([...pages].map(([file, html]) => [`public/${file}`, html]));
  output.set('public/sitemap.xml', sitemap(urls));
  output.set(LEDGER, await format(JSON.stringify(ledger), { ...config, parser: 'json' }));
  return output;
}

if (import.meta.main) {
  for (const [file, content] of await generatePages()) {
    const target = fileURLToPath(new URL(file, repo));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, content);
  }
}
