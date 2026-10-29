const DRAFT_KEY = 'petalpost:draft';
const PHOTO_KEY = 'petalpost:photo';

const form = document.getElementById('form');
const previewCard = document.getElementById('previewCard');
const statusEl = document.getElementById('status');
const params = new URLSearchParams(location.search);
const isGuestView = params.get('view') === '1';

// Share links store {t, d} as URL-safe base64 JSON in the hash.
function encodeState(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeState(text) {
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
  } catch {
    return null;
  }
}

function readStorage(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function pickFields(source = {}) {
  const out = {};
  FIELDS.forEach((f) => { if (typeof source[f] === 'string') out[f] = source[f]; });
  out.photoY = Number.isFinite(Number(source.photoY)) ? Number(source.photoY) : 50;
  out.accent = ACCENTS.includes(source.accent) ? source.accent : null;
  return out;
}

function loadState() {
  const shared = location.hash.startsWith('#d=') ? decodeState(location.hash.slice(3)) : null;
  if (shared) return { t: getTemplate(shared.t).id, d: { ...getTemplate(shared.t).defaults, ...pickFields(shared.d) }, photo: null };

  let draft = null;
  try { draft = JSON.parse(readStorage(DRAFT_KEY)); } catch { draft = null; }
  const requested = params.get('t');
  const base = draft ? { t: getTemplate(draft.t).id, d: { ...getTemplate(draft.t).defaults, ...pickFields(draft.d) } }
    : { t: getTemplate(requested).id, d: { ...getTemplate(requested).defaults, photoY: 50, accent: null } };
  const state = { ...base, photo: readStorage(PHOTO_KEY) };
  if (requested && requested !== state.t) switchTemplate(state, requested);
  return state;
}

// Fields still holding the old template's sample text take the new template's text; user edits stay.
function switchTemplate(state, id) {
  const from = getTemplate(state.t);
  const to = getTemplate(id);
  FIELDS.forEach((f) => {
    if (!state.d[f] || state.d[f] === from.defaults[f]) state.d[f] = to.defaults[f];
  });
  state.t = to.id;
}

const state = loadState();

function shareUrl() {
  const base = location.href.split(/[?#]/)[0];
  const { photoY, ...fields } = state.d;
  return `${base}?view=1#d=${encodeState({ t: state.t, d: fields })}`;
}

function setStatus(text) {
  statusEl.textContent = text;
  clearTimeout(setStatus.timer);
  setStatus.timer = setTimeout(() => { statusEl.textContent = ''; }, 4000);
}

let saveTimer;
function save() {
  if (isGuestView) return;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    writeStorage(DRAFT_KEY, JSON.stringify({ t: state.t, d: state.d }));
    if (!writeStorage(PHOTO_KEY, state.photo)) {
      setStatus('The photo is too large to keep after a reload. Download the PNG before you leave.');
    }
  }, 250);
}

function render() {
  previewCard.innerHTML = renderInvite(getTemplate(state.t), { ...state.d, photo: state.photo });
  fitInvites(previewCard);
  form.classList.toggle('has-photo', Boolean(state.photo));
  document.getElementById('previewGuest').href = shareUrl();
  const map = document.getElementById('openMap');
  map.hidden = !state.d.address;
  map.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(state.d.address || '')}`;
}

function fillForm() {
  FIELDS.forEach((f) => { form.elements[f].value = state.d[f] ?? ''; });
  form.elements.photoY.value = state.d.photoY;
  form.querySelector(`input[name="accent"][value="${state.d.accent || ''}"]`).checked = true;
}

// The picker shows one occasion at a time; the tab follows the selected template.
const pickerTabs = document.getElementById('pickerTabs');
pickerTabs.innerHTML = [...new Set(TEMPLATES.map((t) => t.category))]
  .map((c) => `<button class="filter" type="button" data-category="${c}">${c}</button>`)
  .join('');

function renderPicker(category) {
  pickerTabs.querySelectorAll('.filter').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.category === category)));
  document.getElementById('picker').innerHTML = TEMPLATES.filter((t) => t.category === category).map((t) => `
    <label class="picker-item">
      <input type="radio" name="template" value="${t.id}" ${t.id === state.t ? 'checked' : ''}>
      <span class="invite-wrap">${renderInvite(t)}</span>
      <span class="picker-name">${t.name}</span>
    </label>`).join('');
  fitInvites(document.getElementById('picker'));
}

pickerTabs.addEventListener('click', (e) => {
  const tab = e.target.closest('.filter');
  if (tab) renderPicker(tab.dataset.category);
});

// Accent swatches.

const swatchLabel = { '#A44E47': 'Rose', '#52704C': 'Sage', '#4F6993': 'Dusk blue', '#8A5F18': 'Honey', '#7A5A9A': 'Lilac', '#2F3D35': 'Evergreen' };
document.getElementById('swatches').innerHTML =
  `<label class="swatch swatch-default" title="Template default"><input type="radio" name="accent" value="" aria-label="Template default"></label>` +
  ACCENTS.map((hex) => `
    <label class="swatch" style="background:${hex}" title="${swatchLabel[hex]}">
      <input type="radio" name="accent" value="${hex}" aria-label="${swatchLabel[hex]}">
    </label>`).join('');

form.addEventListener('input', (e) => {
  const { name, value } = e.target;
  if (name === 'template') {
    switchTemplate(state, value);
    fillForm();
  } else if (name === 'accent') {
    state.d.accent = value || null;
  } else if (name === 'photoY') {
    state.d.photoY = Number(value);
  } else if (FIELDS.includes(name)) {
    state.d[name] = value;
  } else {
    return;
  }
  render();
  save();
});

// Photos are downscaled to 1200px JPEG so drafts fit in browser storage.
async function loadPhoto(file) {
  if (!file || !file.type.startsWith('image/')) {
    setStatus('Choose an image file, such as JPG, PNG or HEIC exported to JPG.');
    return;
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    state.photo = canvas.toDataURL('image/jpeg', 0.85);
    render();
    save();
    setStatus('Photo added.');
  } catch {
    setStatus('That image could not be read. Try a JPG or PNG.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

const dropzone = document.getElementById('dropzone');
const photoInput = document.getElementById('photoInput');
photoInput.addEventListener('change', () => { loadPhoto(photoInput.files[0]); photoInput.value = ''; });
dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('is-over'); });
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-over'));
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('is-over');
  loadPhoto(e.dataTransfer.files[0]);
});

document.getElementById('removePhoto').addEventListener('click', () => {
  state.photo = null;
  render();
  save();
});

document.getElementById('reset').addEventListener('click', () => {
  const t = getTemplate(state.t);
  state.d = { ...t.defaults, photoY: state.d.photoY, accent: null };
  fillForm();
  render();
  save();
  setStatus('Text reset to the template sample.');
});

document.getElementById('copyLink').addEventListener('click', async () => {
  const url = shareUrl();
  try {
    await navigator.clipboard.writeText(url);
    setStatus('Link copied. Paste it into a message to your guests.');
  } catch {
    window.prompt('Copy this link:', url);
  }
});

const slug = (text) => (text || 'invite').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'invite';

document.getElementById('downloadPng').addEventListener('click', async (e) => {
  const button = e.currentTarget;
  if (typeof html2canvas !== 'function') {
    setStatus('The image tool is still loading. Try again in a moment.');
    return;
  }
  button.disabled = true;
  try {
    await document.fonts.ready;
    const card = previewCard.querySelector('.invite');
    const canvas = await html2canvas(card, { scale: 1500 / card.offsetWidth, backgroundColor: null, logging: false });
    const link = document.createElement('a');
    link.download = `${slug(state.d.title)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    setStatus('Invite downloaded.');
  } catch {
    setStatus('The download failed. Try again, or take a screenshot of the preview.');
  } finally {
    button.disabled = false;
  }
});

// Guest view: calendar file built from the invite fields.
function icsEscape(text) {
  return String(text || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

document.getElementById('addCalendar').addEventListener('click', () => {
  const d = state.d;
  if (!d.date) { setStatus('This invite has no date yet.'); return; }
  const day = d.date.replace(/-/g, '');
  const [h, m] = (d.time || '12:00').split(':').map(Number);
  const pad = (n) => String(n).padStart(2, '0');
  const endH = Math.min(h + 3, 23);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Petalpost//Invite//EN', 'BEGIN:VEVENT',
    `UID:${day}-${slug(d.title)}@petalpost`, `DTSTAMP:${stamp}`,
    `DTSTART:${day}T${pad(h)}${pad(m)}00`, `DTEND:${day}T${pad(endH)}${pad(m)}00`,
    `SUMMARY:${icsEscape(d.title)}`,
    `LOCATION:${icsEscape([d.venue, d.address].filter(Boolean).join(', '))}`,
    `DESCRIPTION:${icsEscape([d.hosts, d.message, d.rsvp].filter(Boolean).join('\n'))}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  link.download = `${slug(d.title)}.ics`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

if (isGuestView) {
  document.body.classList.add('view-mode');
  document.title = `${state.d.title} | Petalpost`;
}

fillForm();
renderPicker(getTemplate(state.t).category);
render();
