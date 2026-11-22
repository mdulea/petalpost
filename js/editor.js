import './icons.js';
import { UI, accentLabel, categoryLabel, localeOf, pageLang } from './i18n.js';
import { ACCENTS, categoriesFor, getTemplate, renderInvite, templatesFor } from './templates.js';
import { mountInvites } from './mount.js';
import {
  EDITABLE,
  FIELDS,
  FIELD_LIMITS,
  buildIcs,
  changePhoto,
  eventLink,
  makeInviteData,
  mapLink,
  openInvite,
  reportLink,
  resetInvite,
  saveDraft,
  savePublishedEvent,
  shareLink,
  storedPublishedEvent,
  slug,
  storedInvite,
  switchTemplate,
  updateInvite,
} from './invite.js';
import {
  REPLY_LIMITS,
  createClient,
  editorPage,
  makeReply,
  manageLink,
  newId,
  newSecret,
  readCredential,
  responseLink,
} from './rsvp.js';

const lang = pageLang();
const locale = lang === 'ro' ? localeOf('ro') : undefined;
const copy = UI[lang].editor;
const catalog = templatesFor(lang);
const categories = categoriesFor(lang);

const form = /** @type {HTMLFormElement} */ (document.getElementById('form'));
const previewCard = document.getElementById('previewCard');
const statusEl = document.getElementById('status');

// Reading localStorage throws when the browser blocks storage; null storage then keeps nothing.
let storage = null;
try {
  storage = localStorage;
} catch {
  storage = null;
}

const state = openInvite({ search: location.search, hash: location.hash, ...storedInvite(storage, lang), lang });

const pageBase = editorPage(location.origin, lang);
const shareUrl = () => shareLink(pageBase, state);
const client = createClient(fetch, { lang });

/** @type {ReturnType<typeof setTimeout>} */
let statusTimer;
// A message that asks the owner to act, such as downloading before leaving, stays until the next message.
function setStatus(text, { keep = false } = {}) {
  statusEl.textContent = text;
  clearTimeout(statusTimer);
  if (!keep)
    statusTimer = setTimeout(() => {
      statusEl.textContent = '';
    }, 4000);
}

let saveTimer;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveDraft(state, storage, lang), 250);
}

function render() {
  mountInvites(previewCard, renderInvite(getTemplate(state.t, lang), { ...state.d, photo: state.photo }, { locale }));
  form.classList.toggle('has-photo', Boolean(state.photo));
  /** @type {HTMLAnchorElement} */ (document.getElementById('previewGuest')).href = shareUrl();
  const map = /** @type {HTMLAnchorElement} */ (document.getElementById('openMap'));
  const mapUrl = mapLink(state.d);
  map.hidden = !mapUrl;
  if (mapUrl) map.href = mapUrl;
}

function commit() {
  render();
  save();
}

// The accent radio group takes its value too: a null accent checks the template default swatch.
function fillForm() {
  EDITABLE.forEach((f) => {
    form.elements[f].value = state.d[f] ?? '';
  });
}

FIELDS.forEach((f) => {
  if (FIELD_LIMITS[f]) form.elements[f].maxLength = FIELD_LIMITS[f];
});

// The picker shows one occasion at a time; the tab follows the selected template.
const pickerTabs = document.getElementById('pickerTabs');
pickerTabs.innerHTML = categories
  .map((c) => `<button class="filter" type="button" data-category="${c}">${categoryLabel(c, lang)}</button>`)
  .join('');

function renderPicker(category) {
  const active = categories.includes(category) ? category : categories[0];
  pickerTabs
    .querySelectorAll('.filter')
    .forEach((/** @type {HTMLElement} */ b) => b.setAttribute('aria-pressed', String(b.dataset.category === active)));
  mountInvites(
    document.getElementById('picker'),
    catalog
      .filter((t) => t.category === active)
      .map(
        (t) => `
    <label class="picker-item">
      <input type="radio" name="template" value="${t.id}" ${t.id === state.t ? 'checked' : ''}>
      ${renderInvite(t, makeInviteData(t, undefined, lang), { inline: true, decorative: true, locale })}
      <span class="picker-name">${t.name}</span>
    </label>`,
      )
      .join(''),
  );
}

pickerTabs.addEventListener('click', (e) => {
  const tab = /** @type {HTMLElement} */ (/** @type {Element} */ (e.target).closest('.filter'));
  if (tab) renderPicker(tab.dataset.category);
});

// Accent swatches.

document.getElementById('swatches').innerHTML =
  `<label class="swatch swatch-default" title="${copy.defaultSwatch}"><input type="radio" name="accent" value="" aria-label="${copy.defaultSwatch}"></label>` +
  ACCENTS.map((a) => {
    const label = accentLabel(a.hex, lang);
    return `
    <label class="swatch" style="background:${a.hex}" title="${label}">
      <input type="radio" name="accent" value="${a.hex}" aria-label="${label}">
    </label>`;
  }).join('');

form.addEventListener('input', (e) => {
  const { name, value } = /** @type {HTMLInputElement} */ (e.target);
  if (name === 'template') {
    switchTemplate(state, value, lang);
    fillForm();
  } else if (!updateInvite(state, name, value, lang)) {
    return;
  }
  commit();
});

// On narrow layouts the floating Preview button covers the bottom of the screen. The browser scrolls a focused
// control into view only when it is off screen, so a control under the button stays hidden; scroll it above the
// button after the browser's own scroll. Hidden radios and the file input show through their label.
const jumpPreview = document.querySelector('.jump-preview');
form.addEventListener('focusin', (e) => {
  requestAnimationFrame(() => {
    const cover = jumpPreview.getBoundingClientRect();
    const target = /** @type {HTMLElement} */ (e.target);
    const rect = (target.closest('label') ?? target).getBoundingClientRect();
    const overlaps = rect.left < cover.right && cover.left < rect.right && rect.bottom > cover.top;
    if (cover.height && overlaps) scrollBy({ top: rect.bottom - cover.top + 16, behavior: 'instant' });
  });
});

// Photos are downscaled to 1200px JPEG so drafts fit in browser storage.
async function decodePhoto(file) {
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
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadPhoto(file) {
  if (file !== null && (!file || !file.type.startsWith('image/'))) {
    setStatus(copy.chooseImage);
    return;
  }
  const result = await changePhoto(state, file === null ? null : decodePhoto(file), storage, lang);
  if (result === 'superseded') return;
  if (result === 'refused') {
    setStatus(copy.imageRefused);
    return;
  }
  commit();
  if (file === null) setStatus('');
  else if (result === 'saved') setStatus(copy.photoAdded);
  else setStatus(copy.photoTooLarge, { keep: true });
}

const dropzone = document.getElementById('dropzone');
const photoInput = /** @type {HTMLInputElement} */ (document.getElementById('photoInput'));
// Some browsers fire change with no file when the owner cancels the file dialog.
photoInput.addEventListener('change', () => {
  if (photoInput.files[0]) loadPhoto(photoInput.files[0]);
  photoInput.value = '';
});
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('is-over');
});
// dragleave also fires when the pointer moves onto a child of the dropzone.
dropzone.addEventListener('dragleave', (e) => {
  if (!dropzone.contains(/** @type {Node} */ (e.relatedTarget))) dropzone.classList.remove('is-over');
});
dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('is-over');
  loadPhoto(e.dataTransfer.files[0]);
});

document.getElementById('removePhoto').addEventListener('click', () => loadPhoto(null));

document.getElementById('reset').addEventListener('click', () => {
  if (!window.confirm(copy.resetConfirm)) return;
  resetInvite(state, lang);
  fillForm();
  commit();
  setStatus(copy.resetDone);
});

// Copies the link and then calls done, or shows the link in a prompt where the clipboard is blocked.
async function copyLink(url, done) {
  try {
    await navigator.clipboard.writeText(url);
    done();
  } catch {
    window.prompt(copy.copyPrompt, url);
  }
}

document
  .getElementById('copyLink')
  .addEventListener('click', () => copyLink(shareUrl(), () => setStatus(copy.shareCopied)));

document.getElementById('downloadPng').addEventListener('click', async (e) => {
  const button = /** @type {HTMLButtonElement} */ (e.currentTarget);
  if (typeof htmlToImage !== 'object') {
    setStatus(copy.imageToolLoading);
    return;
  }
  button.disabled = true;
  setStatus(copy.preparingImage, { keep: true });
  try {
    await document.fonts.ready;
    const card = /** @type {HTMLElement} */ (previewCard.querySelector('.invite'));
    const link = document.createElement('a');
    link.download = `${slug(state.d.title)}.png`;
    link.href = await htmlToImage.toPng(card, { pixelRatio: 1500 / card.offsetWidth });
    link.click();
    setStatus(copy.downloaded);
  } catch {
    setStatus(copy.downloadFailed);
  } finally {
    button.disabled = false;
  }
});

// Guest view: calendar file built from the invite fields.
document.getElementById('addCalendar').addEventListener('click', () => {
  const ics = buildIcs(state.d, new Date());
  if (!ics) {
    setStatus(copy.noDate);
    return;
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  link.download = `${slug(state.d.title)}.ics`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

// The first publish takes the identity that another tab may have stored since this page opened. Without one, it
// creates the event identity and stores it before the request, so a retry after a lost confirmation reuses the id
// and secret. Later publishes send the version. Nothing reaches the server without a click on Publish.
const publishButton = /** @type {HTMLButtonElement} */ (document.getElementById('publish'));
const publishStatus = document.getElementById('publishStatus');
const eventLinkInput = /** @type {HTMLInputElement} */ (document.getElementById('eventLink'));
const manageLinkInput = /** @type {HTMLInputElement} */ (document.getElementById('manageLink'));

// The links show once the server has confirmed the event; until then the stored identity waits for a retry.
function showPublished() {
  const cred = state.publishedEvent;
  const live = Boolean(cred && cred.version !== null);
  document.getElementById('published').hidden = !live;
  publishButton.lastChild.textContent = live ? copy.publishChanges : copy.publish;
  eventLinkInput.value = live ? eventLink(pageBase, cred.id) : '';
  manageLinkInput.value = live ? manageLink(location.origin, cred.id, cred.secret, lang) : '';
}

// Stores the identity, or forgets it for null. Returns false when this browser cannot keep it.
function rememberEvent(cred) {
  state.publishedEvent = cred;
  const kept = savePublishedEvent(state, storage, lang);
  showPublished();
  return kept;
}

publishButton.addEventListener('click', async () => {
  state.publishedEvent ??= storedPublishedEvent(storage, lang);
  if (!state.publishedEvent) rememberEvent({ id: newId(), secret: newSecret(), version: null });
  const cred = state.publishedEvent;
  publishButton.disabled = true;
  publishStatus.textContent = copy.publishing;
  const result = await client.publish(cred, state);
  publishButton.disabled = false;
  if (result.ok || result.status === 409) {
    const kept = rememberEvent({ ...cred, version: result.data.version });
    const done = cred.version === null ? copy.publishedFirst : copy.publishedUpdated;
    publishStatus.textContent = [result.ok ? done : result.message, kept ? '' : copy.storageRefused].join(' ');
  } else if (result.status === 404 && cred.version !== null) {
    rememberEvent(null);
    publishStatus.textContent = copy.deletedOnServer;
  } else {
    publishStatus.textContent = result.message;
  }
});

document.getElementById('copyEventLink').addEventListener('click', () =>
  copyLink(eventLinkInput.value, () => {
    publishStatus.textContent = copy.eventLinkCopied;
  }),
);
document.getElementById('copyManageLink').addEventListener('click', () =>
  copyLink(manageLinkInput.value, () => {
    publishStatus.textContent = copy.manageLinkCopied;
  }),
);

// Guest replies to a published event. The reply id and secret are made once per page. The guest view never writes
// storage, so the first send puts them in the address as the edit link #r=<id>.<secret> before the request. A retry
// or a reload after a lost confirmation then reuses them and cannot create a second reply. An edit link loads that
// reply, and saving sends its version.
const rsvpForm = /** @type {HTMLFormElement} */ (document.getElementById('rsvpForm'));
const rsvpStatus = document.getElementById('rsvpStatus');
const replyLinkInput = /** @type {HTMLInputElement} */ (document.getElementById('replyLink'));
const sendReply = /** @type {HTMLButtonElement} */ (document.getElementById('sendReply'));
const nameInput = /** @type {HTMLInputElement} */ (document.getElementById('guestName'));
const partySizeInput = /** @type {HTMLInputElement} */ (document.getElementById('partySize'));
nameInput.maxLength = REPLY_LIMITS.name;
partySizeInput.max = String(REPLY_LIMITS.partySize);
const fromLink = readCredential(location.hash, 'r=');
const replyCred = { ...(fromLink ?? { id: newId(), secret: newSecret() }), version: null };

const attendingChecked = () =>
  /** @type {HTMLInputElement} */ (rsvpForm.querySelector('input[name="attending"]:checked')).value === 'yes';

// A declined reply has no party; the size input keeps its number for a change of mind.
function syncPartySize() {
  partySizeInput.disabled = !attendingChecked();
}

function fillReply(reply) {
  nameInput.value = reply.name;
  const answer = /** @type {HTMLInputElement} */ (
    rsvpForm.querySelector(`input[name="attending"][value="${reply.attending ? 'yes' : 'no'}"]`)
  );
  answer.checked = true;
  if (reply.attending) partySizeInput.value = String(reply.partySize);
  syncPartySize();
}

const replyLink = () => responseLink(pageBase, state.event, replyCred.id, replyCred.secret);

function showReplyLink() {
  replyLinkInput.value = replyLink();
  document.getElementById('replySaved').hidden = false;
}

rsvpForm.addEventListener('change', syncPartySize);

rsvpForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const attending = attendingChecked();
  const reply = makeReply({
    name: nameInput.value,
    attending,
    partySize: attending ? Number(partySizeInput.value) : 0,
  });
  if (!reply) {
    rsvpStatus.textContent = copy.replyInvalid(REPLY_LIMITS.partySize);
    return;
  }
  if (state.sample) {
    rsvpStatus.textContent = copy.sampleReply;
    return;
  }
  // The edit link replaces the address before the request, so a reload or bookmark opens the reply if it was saved.
  history.replaceState(null, '', replyLink());
  sendReply.disabled = true;
  rsvpStatus.textContent = copy.sendingReply;
  const result = await client.saveReply(state.event, replyCred, reply);
  sendReply.disabled = false;
  if (result.ok) {
    replyCred.version = result.data.version;
    showReplyLink();
    rsvpStatus.textContent = copy.replySaved;
    return;
  }
  if (result.status === 409) {
    replyCred.version = result.data.version;
    fillReply(result.data);
  }
  rsvpStatus.textContent = result.message;
});

document.getElementById('copyReplyLink').addEventListener('click', () =>
  copyLink(replyLinkInput.value, () => {
    rsvpStatus.textContent = copy.replyLinkCopied;
  }),
);

// The guest view hides the editor heading visually; the invite title becomes the page heading.
function setHeading(heading) {
  document.title = `${heading} | Petalpost`;
  document.querySelector('.editor-head h1').textContent = heading;
}

// An invitation link shows nothing of the invite until the event loads, and only a message when loading fails.
async function openEvent() {
  const result = await client.loadEvent(state.event);
  if (!result.ok) {
    setHeading(result.status === 404 ? copy.missingHeading : copy.loadFailedHeading);
    setStatus(result.message, { keep: true });
    return;
  }
  const template = getTemplate(result.data.t, lang);
  state.t = template.id;
  state.d = makeInviteData(template, result.data.d, lang);
  setHeading(state.d.title || copy.defaultGuestHeading);
  document.body.classList.remove('invite-hidden');
  render();
  rsvpForm.hidden = false;
  /** @type {HTMLAnchorElement} */ (document.getElementById('reportLink')).href = reportLink(
    eventLink(pageBase, state.event),
    lang,
  );
  document.getElementById('reportRow').hidden = false;
  if (!fromLink) return;
  const saved = await client.loadReply(state.event, replyCred);
  // The event exists, so a missing reply was never saved. The empty form sends it as a new reply.
  if (saved.status === 404) return;
  if (!saved.ok) {
    rsvpStatus.textContent = saved.message;
    return;
  }
  replyCred.version = saved.data.version;
  fillReply(saved.data);
  showReplyLink();
  rsvpStatus.textContent = copy.savedReplyShown;
}

// A broken link shows only the message and the link to make an invite; an invite without a title gets a generic one.
if (state.guest) {
  document.body.classList.add('view-mode');
  document.body.classList.toggle('invite-hidden', state.broken || Boolean(state.event));
  if (state.broken) {
    setHeading(copy.brokenHeading);
    setStatus(copy.brokenMessage, { keep: true });
  } else if (state.event) {
    setHeading(copy.openingHeading);
    openEvent();
  } else if (state.sample) {
    setHeading(state.d.title || copy.defaultGuestHeading);
    const sampleNotice = document.getElementById('sampleNotice');
    sampleNotice.textContent = copy.sampleNotice;
    sampleNotice.hidden = false;
    rsvpForm.hidden = false;
  } else {
    setHeading(state.d.title || copy.defaultGuestHeading);
  }
}

showPublished();
fillForm();
renderPicker(getTemplate(state.t, lang).category);
render();
