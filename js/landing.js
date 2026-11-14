import './icons.js';
import {
  ACCENTS,
  BANNER_TEMPLATE,
  CATEGORIES,
  HERO_TEMPLATES,
  TEMPLATES,
  getTemplate,
  renderInvite,
} from './templates.js';
import { mountInvites } from './mount.js';
import { editorUrl, makeInviteData } from './invite.js';

// Hero fan.
mountInvites(
  document.getElementById('heroFan'),
  HERO_TEMPLATES.map((id) => {
    const t = getTemplate(id);
    return renderInvite(t, makeInviteData(t), { href: editorUrl(id), label: `Use the ${t.name} template` });
  }).join(''),
);

// Today's pick rotates daily so returning visitors see a different template.
const dayIndex = Math.floor(Date.now() / 86400000) % TEMPLATES.length;
const pick = TEMPLATES[dayIndex];
const pickLink = /** @type {HTMLAnchorElement} */ (document.getElementById('todaysPick'));
pickLink.href = editorUrl(pick.id);
mountInvites(
  pickLink,
  `${renderInvite(pick, makeInviteData(pick), { decorative: true })}<div><strong>${pick.name}</strong><span>${pick.tagline}</span></div>`,
);

document.getElementById('templateCount').textContent = String(TEMPLATES.length);
document.getElementById('accentCount').textContent = String(ACCENTS.length);

const banner = getTemplate(BANNER_TEMPLATE);
mountInvites(document.getElementById('bannerArt'), renderInvite(banner, makeInviteData(banner)));

// The gallery cards and occasion links are static HTML from scripts/pages.js, so crawlers read them without this
// script. It adds the occasion filters, which only work with JavaScript.
const gallery = document.getElementById('gallery');
const filters = document.getElementById('filters');
filters.innerHTML = ['All', ...CATEGORIES]
  .map((c, i) => `<button class="filter" type="button" aria-pressed="${i === 0}" data-filter="${c}">${c}</button>`)
  .join('');

function applyFilter(category) {
  filters
    .querySelectorAll('.filter')
    .forEach((/** @type {HTMLElement} */ b) => b.setAttribute('aria-pressed', String(b.dataset.filter === category)));
  gallery.querySelectorAll('.card').forEach((/** @type {HTMLElement} */ card) => {
    card.hidden = category !== 'All' && card.dataset.category !== category;
  });
}

filters.addEventListener('click', (e) => {
  const button = /** @type {HTMLElement} */ (/** @type {Element} */ (e.target).closest('.filter'));
  if (button) applyFilter(button.dataset.filter);
});
