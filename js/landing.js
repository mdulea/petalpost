const editorUrl = (id) => `editor.html?t=${encodeURIComponent(id)}`;
const wrap = (template, data) => `<div class="invite-wrap">${renderInvite(template, data)}</div>`;

// Hero fan: three contrasting occasions.
document.getElementById('heroFan').innerHTML = ['birthday', 'wedding', 'baby']
  .map((id) => {
    const t = getTemplate(id);
    return `<a class="invite-wrap" href="${editorUrl(id)}" aria-label="Use the ${t.name} template">${renderInvite(t)}</a>`;
  })
  .join('');

// Today's pick rotates daily so returning visitors see a different template.
const dayIndex = Math.floor(Date.now() / 86400000) % TEMPLATES.length;
const pick = TEMPLATES[dayIndex];
const pickLink = document.getElementById('todaysPick');
pickLink.href = editorUrl(pick.id);
pickLink.innerHTML = `${wrap(pick)}<div><strong>${pick.name}</strong><span>${pick.tagline}</span></div>`;

document.getElementById('templateCount').textContent = TEMPLATES.length;
document.getElementById('accentCount').textContent = ACCENTS.length;

const categories = [...new Set(TEMPLATES.map((t) => t.category))];

document.getElementById('categoryChips').innerHTML = categories
  .map((c) => `<a class="chip-link" href="#templates" data-jump="${c}">${c}</a>`)
  .join('');

document.getElementById('bannerArt').innerHTML = wrap(getTemplate('housewarming'));
document.getElementById('bannerArt').style.transform = 'rotate(4deg)';

// Gallery with occasion filters.
const gallery = document.getElementById('gallery');
gallery.innerHTML = TEMPLATES.map((t, i) => `
  <article class="card" data-category="${t.category}">
    ${i < 2 ? '<span class="badge">Popular</span>' : ''}
    <div class="card-art">${wrap(t)}</div>
    <div class="card-body">
      <div>
        <h3><a class="card-link" href="${editorUrl(t.id)}" style="text-decoration:none">${t.name}</a></h3>
        <p>${t.category}. ${t.tagline}</p>
      </div>
      <span class="card-go" aria-hidden="true"><svg class="icon"><use href="#i-arrow"/></svg></span>
    </div>
  </article>`).join('');

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

fitInvites();

document.getElementById('categoryChips').addEventListener('click', (e) => {
  const chip = e.target.closest('[data-jump]');
  if (chip) applyFilter(chip.dataset.jump);
});
