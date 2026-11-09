// Fails when the pages, robots.txt and sitemap.xml disagree on the production origin, the sitemap misses an indexed page, a page has no favicon, the contact address differs between pages, editor.html lacks a control for an invite field, a template's frame or title font has no CSS rule, or the index.html template or accent count differs from the data.
// Run: node scripts/check-site.js
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { EDITABLE } from '../js/invite.js';
import { ACCENTS, TEMPLATES } from '../js/templates.js';

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
const attr = (html, pattern) => (html.match(pattern) || [])[1];

let failures = 0;
const fail = (message) => { console.log(message); failures++; };

// Indexed pages are the root pages whose robots tag allows indexing.
const pages = readdirSync(new URL('..', import.meta.url))
  .filter((file) => file.endsWith('.html'))
  .map((file) => ({ file, html: read(file) }))
  .filter(({ html }) => /<meta name="robots" content="index/.test(html));

const urls = [];
for (const { file, html } of pages) {
  const canonical = attr(html, /<link rel="canonical" href="([^"]+)"/);
  const ogUrl = attr(html, /<meta property="og:url" content="([^"]+)"/);
  const ogImage = attr(html, /<meta property="og:image" content="([^"]+)"/);
  if (!canonical || !ogUrl || !ogImage) { fail(`${file}: missing canonical, og:url or og:image`); continue; }
  const path = file === 'index.html' ? '/' : `/${file}`;
  if (new URL(canonical).pathname !== path) fail(`${file}: canonical ${canonical} does not end in ${path}`);
  if (ogUrl !== canonical) fail(`${file}: og:url ${ogUrl} differs from canonical ${canonical}`);
  if (!existsSync(new URL(`..${new URL(ogImage).pathname}`, import.meta.url))) fail(`${file}: og:image ${ogImage} has no file`);
  urls.push(canonical, ogImage);
  const icon = attr(html, /<link rel="icon" href="([^"]+)"/);
  if (!icon || !existsSync(new URL(`../${icon}`, import.meta.url))) fail(`${file}: missing favicon link or file`);
}

const sitemapLine = attr(read('robots.txt'), /^Sitemap: (\S+)$/m);
if (!sitemapLine) fail('robots.txt: missing Sitemap line');
else urls.push(sitemapLine);

const locs = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, loc]) => loc);
urls.push(...locs);
const canonicals = pages.map(({ html }) => attr(html, /<link rel="canonical" href="([^"]+)"/)).filter(Boolean);
for (const c of canonicals) if (!locs.includes(c)) fail(`sitemap.xml: missing ${c}`);
for (const loc of locs) if (!canonicals.includes(loc)) fail(`sitemap.xml: ${loc} is not an indexed page`);

const origins = [...new Set(urls.map((url) => new URL(url).origin))];
if (origins.length !== 1) fail(`more than one origin: ${origins.join(', ')}`);

const contacts = pages.map(({ file, html }) => [file, attr(html, /href="mailto:([^"]+)"/)]);
contacts.filter(([, address]) => !address).forEach(([file]) => fail(`${file}: missing contact address`));
const addresses = [...new Set(contacts.map(([, address]) => address).filter(Boolean))];
if (addresses.length > 1) fail(`more than one contact address: ${addresses.join(', ')}`);

// editor.js writes every invite field to the form control of the same name; it generates the accent swatches into #swatches.
const editor = read('editor.html');
for (const f of EDITABLE) {
  const control = f === 'accent' ? /id="swatches"/ : new RegExp(`<(input|textarea|select)\\b[^>]*\\bname="${f}"`);
  if (!control.test(editor)) fail(`editor.html: no control for invite field ${f}`);
}

// renderInvite gives each card a frame-<frame> and a font-<titleFont> class, styled only in css/styles.css.
const styles = read('css/styles.css');
for (const t of TEMPLATES) {
  for (const rule of [`.frame-${t.frame} `, `.font-${t.titleFont} `]) {
    if (!styles.includes(rule)) fail(`css/styles.css: no ${rule.trim()} rule for template ${t.id}`);
  }
}

// landing.js writes the template and accent counts; the HTML text is what shows before it runs.
const index = read('index.html');
for (const [id, count] of [['templateCount', TEMPLATES.length], ['accentCount', ACCENTS.length]]) {
  const shown = attr(index, new RegExp(`id="${id}">([^<]*)<`));
  if (shown !== String(count)) fail(`index.html: #${id} shows ${shown}, landing.js writes ${count}`);
}

console.log(failures ? `${failures} failed` : `site checks passed: ${pages.length} indexed pages under ${origins[0]}, contact ${addresses[0]}`);
process.exit(failures ? 1 : 0);
