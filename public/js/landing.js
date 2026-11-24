import './icons.js';
import './language-banner.js';
import { UI, categoryLabel, localeOf, normalizeLang } from './i18n.js';
import {
  ACCENTS,
  BANNER_TEMPLATE,
  categoriesFor,
  getTemplate,
  heroTemplatesFor,
  renderInvite,
  templatesFor,
} from './templates.js';
import { mountInvites } from './mount.js';
import { editorUrl, makeInviteData } from './invite.js';
import { animate, stopMotion } from './motion.js';

const lang = normalizeLang(document.documentElement.lang);
const locale = lang === 'ro' ? localeOf('ro') : undefined;
const copy = UI[lang].landing;
const catalog = templatesFor(lang);
const categories = categoriesFor(lang);

// Hero fan.
mountInvites(
  document.getElementById('heroFan'),
  heroTemplatesFor(lang)
    .map((id) => {
      const t = getTemplate(id, lang);
      return renderInvite(t, makeInviteData(t, undefined, lang), {
        href: editorUrl(id, lang),
        label: copy.useTemplate(t.name),
        locale,
      });
    })
    .join(''),
);

// Today's pick rotates daily so returning visitors see a different template.
const dayIndex = Math.floor(Date.now() / 86400000) % catalog.length;
const pick = catalog[dayIndex];
const pickLink = /** @type {HTMLAnchorElement} */ (document.getElementById('todaysPick'));
pickLink.href = editorUrl(pick.id, lang);
mountInvites(
  pickLink,
  `${renderInvite(pick, makeInviteData(pick, undefined, lang), { decorative: true, locale })}<div><strong>${pick.name}</strong><span>${pick.tagline}</span></div>`,
);

document.getElementById('accentCount').textContent = String(ACCENTS.length);

const banner = getTemplate(BANNER_TEMPLATE, lang);
mountInvites(
  document.getElementById('bannerArt'),
  renderInvite(banner, makeInviteData(banner, undefined, lang), { locale }),
);

// The gallery cards and occasion links are static HTML from scripts/pages.js, so crawlers read them without this
// script. It adds the occasion filters, which only work with JavaScript.
const gallery = document.getElementById('gallery');
const filters = document.getElementById('filters');
filters.innerHTML = ['All', ...categories]
  .map(
    (c, i) =>
      `<button class="filter" type="button" aria-pressed="${i === 0}" data-filter="${c}">${c === 'All' ? copy.all : categoryLabel(c, lang)}</button>`,
  )
  .join('');

const cards = /** @type {HTMLElement[]} */ ([...gallery.querySelectorAll('.card')]);
let filterRun = 0;

// The shown cards fade out over 150ms, then the chosen category's cards fade in and rise 8px over 200ms. A later
// filter click cancels both steps, so the gallery always ends on the last category chosen.
async function applyFilter(category) {
  const run = (filterRun += 1);
  filters
    .querySelectorAll('.filter')
    .forEach((/** @type {HTMLElement} */ b) => b.setAttribute('aria-pressed', String(b.dataset.filter === category)));
  const shown = cards.filter((card) => !card.hidden);
  stopMotion(cards);
  // The outgoing cards keep opacity 0 after the fade until they are hidden or fade back in.
  await animate(shown, [{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease-in', fill: 'forwards' });
  if (run !== filterRun) return;
  for (const card of cards) card.hidden = category !== 'All' && card.dataset.category !== category;
  stopMotion(shown);
  animate(
    cards.filter((card) => !card.hidden),
    [
      { opacity: 0, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 200, easing: 'ease-out' },
  );
}

filters.addEventListener('click', (e) => {
  const button = /** @type {HTMLElement} */ (/** @type {Element} */ (e.target).closest('.filter'));
  if (button) applyFilter(button.dataset.filter);
});
