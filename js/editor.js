import './icons.js';
import { ACCENTS, CATEGORIES, TEMPLATES, getTemplate, renderInvite } from './templates.js';
import { mountInvites } from './mount.js';
import {
  EDITABLE,
  FIELDS,
  FIELD_LIMITS,
  buildIcs,
  changePhoto,
  eventLink,
  eventPreviewMeta,
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

const state = openInvite({
  pathname: location.pathname,
  search: location.search,
  hash: location.hash,
  ...storedInvite(storage),
});

const pageBase = editorPage(location.origin);
const shareUrl = () => shareLink(pageBase, state);
const client = createClient();

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
  saveTimer = setTimeout(() => saveDraft(state, storage), 250);
}

function render() {
  mountInvites(previewCard, renderInvite(getTemplate(state.t), { ...state.d, photo: state.photo }));
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
pickerTabs.innerHTML = CATEGORIES.map(
  (c) => `<button class="filter" type="button" data-category="${c}">${c}</button>`,
).join('');

function renderPicker(category) {
  pickerTabs
    .querySelectorAll('.filter')
    .forEach((/** @type {HTMLElement} */ b) => b.setAttribute('aria-pressed', String(b.dataset.category === category)));
  mountInvites(
    document.getElementById('picker'),
    TEMPLATES.filter((t) => t.category === category)
      .map(
        (t) => `
    <label class="picker-item">
      <input type="radio" name="template" value="${t.id}" ${t.id === state.t ? 'checked' : ''}>
      ${renderInvite(t, makeInviteData(t), { inline: true, decorative: true })}
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
  `<label class="swatch swatch-default" title="Template default"><input type="radio" name="accent" value="" aria-label="Template default"></label>` +
  ACCENTS.map(
    (a) => `
    <label class="swatch" style="background:${a.hex}" title="${a.name}">
      <input type="radio" name="accent" value="${a.hex}" aria-label="${a.name}">
    </label>`,
  ).join('');

form.addEventListener('input', (e) => {
  const { name, value } = /** @type {HTMLInputElement} */ (e.target);
  if (name === 'template') {
    switchTemplate(state, value);
    fillForm();
  } else if (!updateInvite(state, name, value)) {
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
    setStatus('Choose an image file, such as JPG, PNG or HEIC exported to JPG.');
    return;
  }
  const result = await changePhoto(state, file === null ? null : decodePhoto(file), storage);
  if (result === 'superseded') return;
  if (result === 'refused') {
    setStatus('That image could not be read. Try a JPG or PNG.');
    return;
  }
  commit();
  if (file === null) setStatus('');
  else if (result === 'saved') {
    setStatus(
      'Photo added. It stays in this browser, so the invitation link shows the illustration. To send the photo, download the PNG.',
      { keep: true },
    );
  } else {
    setStatus(
      'Photo added, but it is too large to keep after a reload. The invitation link shows the illustration, so download the PNG to send the photo.',
      { keep: true },
    );
  }
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
  if (!window.confirm('Replace all your text with the template sample?')) return;
  resetInvite(state);
  fillForm();
  commit();
  setStatus('Text reset to the template sample.');
});

// Copies the link and then calls done, or shows the link in a prompt where the clipboard is blocked.
async function copyLink(url, done) {
  try {
    await navigator.clipboard.writeText(url);
    done();
  } catch {
    window.prompt('Copy this link:', url);
  }
}

const canShareLink = typeof navigator.share === 'function';
const canShareFile = (() => {
  if (!canShareLink || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [new File([], 'invite.png', { type: 'image/png' })] });
  } catch {
    return false;
  }
})();

// Shares a link through the device share sheet, falling back to clipboard copy on non-abort failure.
async function shareLinkNative(url, onShared, onCopied) {
  const meta = eventPreviewMeta(state.d);
  try {
    await navigator.share({ title: meta.title, text: meta.description, url });
    onShared();
  } catch (error) {
    if (error?.name === 'AbortError') return;
    await copyLink(url, onCopied);
  }
}

// Decodes a data URL in memory so building a PNG File never triggers fetch against the connect-src CSP.
function dataUrlToFile(dataUrl, filename) {
  const [header, encoded] = dataUrl.split(',');
  const type = header.match(/data:([^;]+)/)?.[1] ?? 'image/png';
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new File([bytes], filename, { type });
}

function downloadDataUrl(dataUrl, filename) {
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

async function renderPng() {
  await document.fonts.ready;
  const card = /** @type {HTMLElement} */ (previewCard.querySelector('.invite'));
  return htmlToImage.toPng(card, { pixelRatio: 1500 / card.offsetWidth });
}
document.getElementById('downloadPng').addEventListener('click', async (e) => {
  const button = /** @type {HTMLButtonElement} */ (e.currentTarget);
  if (typeof htmlToImage !== 'object') {
    setStatus('The image tool is still loading. Try again in a moment.');
    return;
  }
  button.disabled = true;
  setStatus('Preparing the image.', { keep: true });
  try {
    downloadDataUrl(await renderPng(), `${slug(state.d.title)}.png`);
    setStatus('Invite downloaded.');
  } catch {
    setStatus('The download failed. Try again, or take a screenshot of the preview.');
  } finally {
    button.disabled = false;
  }
});

const sharePngButton = /** @type {HTMLButtonElement} */ (document.getElementById('sharePng'));
sharePngButton.hidden = !canShareFile;
sharePngButton.addEventListener('click', async () => {
  if (typeof htmlToImage !== 'object') {
    setStatus('The image tool is still loading. Try again in a moment.');
    return;
  }
  sharePngButton.disabled = true;
  setStatus('Preparing the image.', { keep: true });
  let dataUrl;
  try {
    dataUrl = await renderPng();
  } catch {
    setStatus('The download failed. Try again, or take a screenshot of the preview.');
    sharePngButton.disabled = false;
    return;
  }
  const filename = `${slug(state.d.title)}.png`;
  try {
    const file = dataUrlToFile(dataUrl, filename);
    await navigator.share({ files: [file], title: eventPreviewMeta(state.d).title });
    setStatus('Invite shared.');
  } catch (error) {
    if (error?.name === 'AbortError') {
      setStatus('');
    } else {
      downloadDataUrl(dataUrl, filename);
      setStatus('Invite downloaded.');
    }
  } finally {
    sharePngButton.disabled = false;
  }
});

// Guest view: calendar file built from the invite fields.
document.getElementById('addCalendar').addEventListener('click', () => {
  const ics = buildIcs(state.d, new Date());
  if (!ics) {
    setStatus('This invite has no valid date yet.');
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
  publishButton.lastChild.textContent = live ? 'Publish changes' : 'Publish';
  eventLinkInput.value = live ? eventLink(location.origin, cred.id) : '';
  manageLinkInput.value = live ? manageLink(location.origin, cred.id, cred.secret) : '';
}

// Stores the identity, or forgets it for null. Returns false when this browser cannot keep it.
function rememberEvent(cred) {
  state.publishedEvent = cred;
  const kept = savePublishedEvent(state, storage);
  showPublished();
  return kept;
}

publishButton.addEventListener('click', async () => {
  state.publishedEvent ??= storedPublishedEvent(storage);
  if (!state.publishedEvent) rememberEvent({ id: newId(), secret: newSecret(), version: null });
  const cred = state.publishedEvent;
  publishButton.disabled = true;
  publishStatus.textContent = 'Publishing.';
  const result = await client.publish(cred, state);
  publishButton.disabled = false;
  if (result.ok || result.status === 409) {
    const kept = rememberEvent({ ...cred, version: result.data.version });
    const done =
      cred.version === null
        ? 'Published. Send the invitation link to your guests.'
        : 'Published. Guests see the changes when they open the invitation link.';
    publishStatus.textContent = [
      result.ok ? done : result.message,
      kept ? '' : 'This browser cannot keep the invitation, so save the management link now.',
    ].join(' ');
  } else if (result.status === 404 && cred.version !== null) {
    rememberEvent(null);
    publishStatus.textContent =
      'This invitation was deleted with its replies. Publish again to make a new invitation link.';
  } else {
    publishStatus.textContent = result.message;
  }
});

document.getElementById('copyEventLink').addEventListener('click', () =>
  copyLink(eventLinkInput.value, () => {
    publishStatus.textContent = 'Invitation link copied. Paste it into a message to your guests.';
  }),
);
const shareEventLinkButton = /** @type {HTMLButtonElement} */ (document.getElementById('shareEventLink'));
shareEventLinkButton.hidden = !canShareLink;
shareEventLinkButton.addEventListener('click', () =>
  shareLinkNative(
    eventLinkInput.value,
    () => {
      publishStatus.textContent = 'Invitation link shared.';
    },
    () => {
      publishStatus.textContent = 'Invitation link copied. Paste it into a message to your guests.';
    },
  ),
);
document.getElementById('copyManageLink').addEventListener('click', () =>
  copyLink(manageLinkInput.value, () => {
    publishStatus.textContent = 'Management link copied. Keep it somewhere private.';
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

const replyLink = () => responseLink(location.origin, state.event, replyCred.id, replyCred.secret);

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
    rsvpStatus.textContent = `Enter your name, and a party size from 1 to ${REPLY_LIMITS.partySize} when you come.`;
    return;
  }
  if (state.sample) {
    rsvpStatus.textContent =
      'Sample reply checked locally. Nothing was sent. Use Make your own to collect real replies and track headcount.';
    return;
  }
  // The edit link replaces the address before the request, so a reload or bookmark opens the reply if it was saved.
  history.replaceState(null, '', replyLink());
  sendReply.disabled = true;
  rsvpStatus.textContent = 'Sending your reply.';
  const result = await client.saveReply(state.event, replyCred, reply);
  sendReply.disabled = false;
  if (result.ok) {
    replyCred.version = result.data.version;
    showReplyLink();
    rsvpStatus.textContent = 'Your reply is saved. The host can see it now.';
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
    rsvpStatus.textContent = 'Edit link copied. Keep it to change your reply later.';
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
    setHeading(result.status === 404 ? 'This invitation does not exist' : 'The invitation could not be loaded');
    setStatus(result.message, { keep: true });
    return;
  }
  const template = getTemplate(result.data.t);
  state.t = template.id;
  state.d = makeInviteData(template, result.data.d);
  setHeading(state.d.title || 'You are invited');
  document.body.classList.remove('invite-hidden');
  render();
  rsvpForm.hidden = false;
  /** @type {HTMLAnchorElement} */ (document.getElementById('reportLink')).href = reportLink(
    eventLink(location.origin, state.event),
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
  rsvpStatus.textContent = 'Your saved reply is shown. Change it and send it again.';
}

// A broken link shows only the message and the link to make an invite; an invite without a title gets a generic one.
if (state.guest) {
  document.body.classList.add('view-mode');
  document.body.classList.toggle('invite-hidden', state.broken || Boolean(state.event));
  if (state.broken) {
    setHeading('This invite link is incomplete');
    setStatus('This invite link is incomplete. Ask the host to send the whole link again.', { keep: true });
  } else if (state.event) {
    setHeading('Opening the invitation');
    openEvent();
  } else if (state.sample) {
    setHeading(state.d.title || 'You are invited');
    const sampleNotice = document.getElementById('sampleNotice');
    sampleNotice.textContent = 'Sample invitation. Replies submitted here are not saved.';
    sampleNotice.hidden = false;
    rsvpForm.hidden = false;
  } else {
    setHeading(state.d.title || 'You are invited');
  }
}

showPublished();
fillForm();
renderPicker(getTemplate(state.t).category);
render();
