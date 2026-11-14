// Generates the site HTML that crawlers must read without running JavaScript, from the template catalog and
// scripts/occasions.js: one page per occasion, and the regions between <!-- generated:NAME --> and
// <!-- /generated:NAME --> markers in the root pages, which are the index.html gallery and occasion links and every
// page footer. generatePages() resolves a Map from root file name to its content, formatted with Prettier;
// check-site.js fails when a committed file differs from it.
// Run: pnpm pages, which writes the files.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';
import { editorUrl, makeInviteData } from '../js/invite.js';
import { CATEGORIES, POPULAR_TEMPLATES, TEMPLATES, renderInvite } from '../js/templates.js';
import { OCCASIONS } from './occasions.js';

const root = new URL('..', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');

// The footer contact address on every page. The README Deployment section says when to replace it.
export const CONTACT = 'hello@example.com';

// Every absolute URL derives from the index.html canonical, so changing the production origin starts there.
export const ORIGIN = new URL(read('index.html').match(/<link rel="canonical" href="([^"]+)"/)[1]).origin;

// Sample cards render with a fixed locale so the output does not depend on the machine that runs pnpm pages.
const LOCALE = 'en-US';

const occasionLinks = (categories) =>
  categories.map((c) => `<a class="chip-link" href="${OCCASIONS[c].file}">${c}</a>`).join('');

const card = (t) => `
  <article class="card" data-category="${t.category}">
    ${POPULAR_TEMPLATES.includes(t.id) ? '<span class="badge">Popular</span>' : ''}
    <div class="card-art">${renderInvite(t, makeInviteData(t), { decorative: true, locale: LOCALE })}</div>
    <div class="card-body">
      <div>
        <h3><a class="card-link" href="${editorUrl(t.id)}">${t.name}</a></h3>
        <p>${t.category}. ${t.tagline}</p>
      </div>
      <span class="card-go" aria-hidden="true"><svg class="icon"><use href="#i-arrow"/></svg></span>
    </div>
  </article>`;

// Footer links are root-relative so 404.html, which answers any path, links to the same pages.
const footer = () => `
  <footer class="site-footer">
    <p class="footer-tagline">Petalpost. Made for the people you love to gather.</p>
    <nav class="footer-nav" aria-label="Footer">
      <div class="footer-group">
        <p class="footer-title">Occasions</p>
        ${CATEGORIES.map((c) => `<a href="/${OCCASIONS[c].file}">${OCCASIONS[c].heading}</a>`).join('')}
      </div>
      <div class="footer-group">
        <p class="footer-title">Guides</p>
        <a href="/invitation-wording.html">Invitation wording</a>
        <a href="/when-to-send-invitations.html">When to send invitations</a>
      </div>
      <div class="footer-group">
        <p class="footer-title">Petalpost</p>
        <a href="/">Home</a>
        <a href="/editor.html">Make an invite</a>
        <a href="/about.html">About</a>
        <a href="/privacy.html">Privacy</a>
        <a href="mailto:${CONTACT}">Contact</a>
      </div>
    </nav>
  </footer>`;

const REGIONS = {
  gallery: () => TEMPLATES.map(card).join(''),
  occasions: () => occasionLinks(CATEGORIES),
  footer,
};

const header = () => `
  <header class="site-header">
    <a class="brand" href="/" aria-label="Petalpost home">
      <svg class="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
        <rect x="4" y="10" width="32" height="22" rx="4" fill="#F9E6E2" stroke="#A9524C" stroke-width="2" />
        <path d="M5 12l15 11 15-11" fill="none" stroke="#A9524C" stroke-width="2" stroke-linejoin="round" />
        <path d="M20 19c-1.6-2.4-5-1.4-5 1.2 0 2.4 5 5.3 5 5.3s5-2.9 5-5.3c0-2.6-3.4-3.6-5-1.2z" fill="#7C9A74" />
      </svg>
      Petalpost
    </a>
    <nav class="nav" aria-label="Main">
      <a class="pill" href="/#templates"><svg class="icon"><use href="#i-layout" /></svg>All templates</a>
      <a class="pill pill-cta" href="editor.html"><svg class="icon"><use href="#i-pen" /></svg>Create invite</a>
    </nav>
  </header>`;

const guideSection = ({ heading, intro = [], paragraphs = [], list, quotes }) => `
  <h2>${heading}</h2>
  ${intro.map((p) => `<p>${p}</p>`).join('')}
  ${list ? `<ul>${list.map((item) => `<li>${item}</li>`).join('')}</ul>` : ''}
  ${quotes ? quotes.map((q) => `<blockquote><p>${q}</p></blockquote>`).join('') : ''}
  ${paragraphs.map((p) => `<p>${p}</p>`).join('')}`;

function occasionPage(category) {
  const o = OCCASIONS[category];
  const title = `Petalpost | ${o.heading}`;
  const url = `${ORIGIN}/${o.file}`;
  const templates = TEMPLATES.filter((t) => t.category === category);
  const others = CATEGORIES.filter((c) => c !== category);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <title>${title}</title>
    <meta name="description" content="${o.description}" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="website" />
    <meta property="og:site_name" content="Petalpost" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${o.description}" />
    <meta property="og:url" content="${url}" />
    <meta property="og:image" content="${ORIGIN}/og-image.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:image:alt" content="Petalpost: three hand-drawn invitation cards beside the words Your day, your invite." />
    <meta name="twitter:card" content="summary_large_image" />
    <link rel="icon" href="favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="css/fonts.css" />
    <link rel="stylesheet" href="css/styles.css" />
  </head>
  <body>
    ${header()}
    <main>
      <section class="section" aria-labelledby="occasion-title">
        <div class="section-head">
          <div>
            <h1 id="occasion-title">${o.heading}</h1>
            <p>${o.lead}</p>
          </div>
          <a class="btn btn-primary" href="${editorUrl(templates[0].id)}"><svg class="icon"><use href="#i-pen" /></svg>Start your invite</a>
        </div>
        <div class="gallery">${templates.map(card).join('')}</div>
      </section>
      <div class="prose occasion-guide">${o.sections.map(guideSection).join('')}</div>
      <section class="section" aria-labelledby="more-title">
        <div class="section-head">
          <div>
            <h2 id="more-title">More occasions</h2>
            <p>Every design takes your own photo, names, date and address.</p>
          </div>
        </div>
        <div class="chips">${occasionLinks(others)}</div>
      </section>
    </main>
    <!-- generated:footer -->${footer()}<!-- /generated:footer -->
    <script type="module" src="js/page.js"></script>
    <script src="js/analytics.js"></script>
    <script defer src="/_vercel/insights/script.js"></script>
  </body>
</html>
`;
}

// Replaces the content of every known marker region in html.
const fillRegions = (html) =>
  html.replace(/(<!-- generated:(\w+) -->)[\s\S]*?(<!-- \/generated:\2 -->)/g, (match, open, name, close) =>
    REGIONS[name] ? `${open}${REGIONS[name]()}${close}` : match,
  );

export async function generatePages() {
  const raw = new Map(CATEGORIES.map((c) => [OCCASIONS[c].file, occasionPage(c)]));
  for (const file of readdirSync(root).filter((f) => f.endsWith('.html') && !raw.has(f))) {
    const html = read(file);
    if (html.includes('<!-- generated:')) raw.set(file, fillRegions(html));
  }
  const config = await resolveConfig(new URL('index.html', root));
  const pages = new Map();
  for (const [file, html] of raw) pages.set(file, await format(html, { ...config, parser: 'html' }));
  return pages;
}

if (import.meta.main) {
  for (const [file, html] of await generatePages()) writeFileSync(new URL(file, root), html);
}
