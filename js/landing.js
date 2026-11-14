import './icons.js';
import {
  ACCENTS,
  BANNER_TEMPLATE,
  CATEGORIES,
  HERO_TEMPLATES,
  POPULAR_TEMPLATES,
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

document.getElementById('categoryChips').innerHTML = CATEGORIES.map(
  (c) => `<a class="chip-link" href="#templates" data-jump="${c}">${c}</a>`,
).join('');

const banner = getTemplate(BANNER_TEMPLATE);
mountInvites(document.getElementById('bannerArt'), renderInvite(banner, makeInviteData(banner)));

// Gallery with occasion filters.
const gallery = document.getElementById('gallery');
mountInvites(
  gallery,
  TEMPLATES.map(
    (t) => `
  <article class="card" data-category="${t.category}">
    ${POPULAR_TEMPLATES.includes(t.id) ? '<span class="badge">Popular</span>' : ''}
    <div class="card-art">${renderInvite(t, makeInviteData(t), { decorative: true })}</div>
    <div class="card-body">
      <div>
        <h3><a class="card-link" href="${editorUrl(t.id)}">${t.name}</a></h3>
        <p>${t.category}. ${t.tagline}</p>
      </div>
      <span class="card-go" aria-hidden="true"><svg class="icon"><use href="#i-arrow"/></svg></span>
    </div>
  </article>`,
  ).join(''),
);

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

document.getElementById('categoryChips').addEventListener('click', (e) => {
  const chip = /** @type {HTMLElement} */ (/** @type {Element} */ (e.target).closest('[data-jump]'));
  if (chip) applyFilter(chip.dataset.jump);
});
