const DRAFT_KEY = 'petalpost:draft';
const PHOTO_KEY = 'petalpost:photo';

const form = document.getElementById('form');
const previewCard = document.getElementById('previewCard');
const statusEl = document.getElementById('status');
const params = new URLSearchParams(location.search);
const isGuestView = params.get('view') === '1';

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

const state = openInvite({
  hash: location.hash, draft: readStorage(DRAFT_KEY), photo: readStorage(PHOTO_KEY), requested: params.get('t'),
});

const shareUrl = () => shareLink(location.href.split(/[?#]/)[0], state);

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
  mountInvites(previewCard, renderInvite(getTemplate(state.t), { ...state.d, photo: state.photo }));
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
  mountInvites(document.getElementById('picker'), TEMPLATES.filter((t) => t.category === category).map((t) => `
    <label class="picker-item">
      <input type="radio" name="template" value="${t.id}" ${t.id === state.t ? 'checked' : ''}>
      ${renderInvite(t, {}, 'span')}
      <span class="picker-name">${t.name}</span>
    </label>`).join(''));
}

pickerTabs.addEventListener('click', (e) => {
  const tab = e.target.closest('.filter');
  if (tab) renderPicker(tab.dataset.category);
});

// Accent swatches.

document.getElementById('swatches').innerHTML =
  `<label class="swatch swatch-default" title="Template default"><input type="radio" name="accent" value="" aria-label="Template default"></label>` +
  ACCENTS.map((a) => `
    <label class="swatch" style="background:${a.hex}" title="${a.name}">
      <input type="radio" name="accent" value="${a.hex}" aria-label="${a.name}">
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
  state.d = makeInviteData(t, { photoY: state.d.photoY });
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

document.getElementById('downloadPng').addEventListener('click', async (e) => {
  const button = e.currentTarget;
  if (typeof htmlToImage !== 'object') {
    setStatus('The image tool is still loading. Try again in a moment.');
    return;
  }
  button.disabled = true;
  try {
    await document.fonts.ready;
    const card = previewCard.querySelector('.invite');
    const link = document.createElement('a');
    link.download = `${slug(state.d.title)}.png`;
    link.href = await htmlToImage.toPng(card, { pixelRatio: 1500 / card.offsetWidth });
    link.click();
    setStatus('Invite downloaded.');
  } catch {
    setStatus('The download failed. Try again, or take a screenshot of the preview.');
  } finally {
    button.disabled = false;
  }
});

// Guest view: calendar file built from the invite fields.
document.getElementById('addCalendar').addEventListener('click', () => {
  const d = state.d;
  if (!d.date) { setStatus('This invite has no date yet.'); return; }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([buildIcs(d, new Date())], { type: 'text/calendar' }));
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
