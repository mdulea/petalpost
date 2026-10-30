import './icons.js';
import { ACCENTS, BANNER_TEMPLATE, HERO_TEMPLATES, TEMPLATES, getTemplate, renderInvite } from './templates.js';
import { mountInvites } from './mount.js';
import { editorUrl, makeInviteData } from './invite.js';

// Hero fan.
mountInvites(document.getElementById('heroFan'), HERO_TEMPLATES
  .map((id) => {
    const t = getTemplate(id);
    return renderInvite(t, makeInviteData(t), { href: editorUrl(id), label: `Use the ${t.name} template` });
  })
  .join(''));

// Today's pick rotates daily so returning visitors see a different template.
const dayIndex = Math.floor(Date.now() / 86400000) % TEMPLATES.length;
const pick = TEMPLATES[dayIndex];
const pickLink = document.getElementById('todaysPick');
pickLink.href = editorUrl(pick.id);
mountInvites(pickLink, `${renderInvite(pick, makeInviteData(pick))}<div><strong>${pick.name}</strong><span>${pick.tagline}</span></div>`);

document.getElementById('templateCount').textContent = TEMPLATES.length;
document.getElementById('accentCount').textContent = ACCENTS.length;

const categories = [...new Set(TEMPLATES.map((t) => t.category))];

document.getElementById('categoryChips').innerHTML = categories
  .map((c) => `<a class="chip-link" href="#templates" data-jump="${c}">${c}</a>`)
  .join('');

const banner = getTemplate(BANNER_TEMPLATE);
mountInvites(document.getElementById('bannerArt'), renderInvite(banner, makeInviteData(banner)));
document.getElementById('bannerArt').style.transform = 'rotate(4deg)';

// Gallery with occasion filters.
const gallery = document.getElementById('gallery');
mountInvites(gallery, TEMPLATES.map((t, i) => `
  <article class="card" data-category="${t.category}">
    ${i < 2 ? '<span class="badge">Popular</span>' : ''}
    <div class="card-art">${renderInvite(t, makeInviteData(t))}</div>
    <div class="card-body">
      <div>
        <h3><a class="card-link" href="${editorUrl(t.id)}" style="text-decoration:none">${t.name}</a></h3>
        <p>${t.category}. ${t.tagline}</p>
      </div>
      <span class="card-go" aria-hidden="true"><svg class="icon"><use href="#i-arrow"/></svg></span>
    </div>
  </article>`).join(''));

const filters = document.getElementById('filters');
filters.innerHTML = ['All', ...categories]
  .map((c, i) => `<button class="filter" type="button" aria-pressed="${i === 0}" data-filter="${c}">${c}</button>`)
  .join('');

function applyFilter(category) {
  filters.querySelectorAll('.filter').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === category)));
  gallery.querySelectorAll('.card').forEach((card) => {
    card.hidden = category !== 'All' && card.dataset.category !== category;
  });
}

filters.addEventListener('click', (e) => {
  const button = e.target.closest('.filter');
  if (button) applyFilter(button.dataset.filter);
});

document.getElementById('categoryChips').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-jump]');
  if (chip) applyFilter(chip.dataset.jump);
});
