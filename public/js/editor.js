import './icons.js';
import './language-banner.js';
import { UI, accentLabel, categoryLabel, localeOf, normalizeLang } from './i18n.js';
import { ACCENTS, categoriesFor, getTemplate, renderInvite, templatesFor } from './templates.js';
import { mountInvites } from './mount.js';
import {
  EDITABLE,
  FIELDS,
  FIELD_LIMITS,
  buildIcs,
  charsLeft,
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
  REPLY_FIELDS,
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

const lang = normalizeLang(document.documentElement.lang);
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

const state = openInvite({
  pathname: location.pathname,
  search: location.search,
  hash: location.hash,
  ...storedInvite(storage, lang),
  lang,
});

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

// A limited text field shows the characters left below it once its text passes 80% of the limit. The counter joins
// the field's description after any hint, so a screen reader reads it with the field. The shared live region
// announces the counter only when typing reaches the limit. Every other change clears it, so the next arrival
// announces and a script that sets field values leaves no stale text.
const limitAlert = document.createElement('p');
limitAlert.className = 'visually-hidden';
limitAlert.id = 'limitAlert';
limitAlert.setAttribute('role', 'status');
document.body.append(limitAlert);
/** @type {Map<HTMLInputElement | HTMLTextAreaElement, {counter: HTMLElement, limit: number, length: (text: string) => number, count: number}>} */
const counters = new Map();

// Gives input its limit, a counter after it as its description, and a counter refresh on each input event. By
// default maxLength enforces the limit in UTF-16 units, the unit the browser counts. With codePoints, the counter
// counts code points as makeReply does, so an emoji counts once. maxLength cannot count code points, so such a field
// keeps text past its limit, and makeReply reports it on send.
function addCounter(input, limit, { codePoints = false } = {}) {
  if (!codePoints) input.maxLength = limit;
  const counter = document.createElement('span');
  counter.className = 'counter';
  counter.id = `${input.id}Count`;
  input.after(counter);
  input.setAttribute(
    'aria-describedby',
    [input.getAttribute('aria-describedby'), counter.id].filter(Boolean).join(' '),
  );
  const entry = { counter, limit, length: codePoints ? (text) => [...text].length : (text) => text.length, count: 0 };
  counters.set(input, entry);
  input.addEventListener('input', () => {
    const before = entry.count;
    showCounts();
    if (entry.count >= limit && before < limit) limitAlert.textContent = copy.charsLeft(0);
  });
}

// Writes each counter from its field's value and clears the live region; call after a script sets field values.
function showCounts() {
  limitAlert.textContent = '';
  counters.forEach((entry, input) => {
    entry.count = entry.length(input.value);
    const left = charsLeft(entry.count, entry.limit);
    entry.counter.hidden = left === null;
    entry.counter.textContent = left === null ? '' : copy.charsLeft(left);
  });
}

// The accent radio group takes its value too: a null accent checks the template default swatch.
function fillForm() {
  EDITABLE.forEach((f) => {
    form.elements[f].value = state.d[f] ?? '';
  });
  showCounts();
}

FIELDS.forEach((f) => {
  if (FIELD_LIMITS[f]) addCounter(form.elements[f], FIELD_LIMITS[f]);
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
  else if (result === 'saved') setStatus(copy.photoAdded, { keep: true });
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
  const meta = eventPreviewMeta(state.d, localeOf(lang));
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
    setStatus(copy.imageToolLoading);
    return;
  }
  button.disabled = true;
  setStatus(copy.preparingImage, { keep: true });
  try {
    downloadDataUrl(await renderPng(), `${slug(state.d.title)}.png`);
    setStatus(copy.downloaded);
  } catch {
    setStatus(copy.downloadFailed);
  } finally {
    button.disabled = false;
  }
});

const sharePngButton = /** @type {HTMLButtonElement} */ (document.getElementById('sharePng'));
sharePngButton.hidden = !canShareFile;
sharePngButton.addEventListener('click', async () => {
  if (typeof htmlToImage !== 'object') {
    setStatus(copy.imageToolLoading);
    return;
  }
  sharePngButton.disabled = true;
  setStatus(copy.preparingImage, { keep: true });
  let dataUrl;
  try {
    dataUrl = await renderPng();
  } catch {
    setStatus(copy.downloadFailed);
    sharePngButton.disabled = false;
    return;
  }
  const filename = `${slug(state.d.title)}.png`;
  try {
    const file = dataUrlToFile(dataUrl, filename);
    await navigator.share({ files: [file], title: eventPreviewMeta(state.d, localeOf(lang)).title });
    setStatus(copy.inviteShared);
  } catch (error) {
    if (error?.name === 'AbortError') {
      setStatus('');
    } else {
      downloadDataUrl(dataUrl, filename);
      setStatus(copy.downloaded);
    }
  } finally {
    sharePngButton.disabled = false;
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
const publishedPanel = document.getElementById('published');

// A confirmation panel shows the result of the action that just succeeded. Its .outcome heading names the outcome,
// and focus moves to the panel, so a screen reader reads it and a keyboard continues from it. A panel that shows saved
// state, such as the links after a reload, keeps its heading hidden, and so does a panel whose last action failed.
function showOutcome(panel, heading) {
  panel.hidden = false;
  setOutcome(panel, heading);
  panel.focus();
}

function setOutcome(panel, heading) {
  const outcome = /** @type {HTMLElement} */ (panel.querySelector('.outcome'));
  outcome.hidden = !heading;
  outcome.textContent = heading ?? '';
}

// The links show once the server has confirmed the event; until then the stored identity waits for a retry.
function showPublished() {
  const cred = state.publishedEvent;
  const live = Boolean(cred && cred.version !== null);
  publishedPanel.hidden = !live;
  if (!live) setOutcome(publishedPanel, null);
  publishButton.lastChild.textContent = live ? copy.publishChanges : copy.publish;
  eventLinkInput.value = live ? eventLink(location.origin, cred.id, lang) : '';
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
  setOutcome(publishedPanel, null);
  const result = await client.publish(cred, state);
  publishButton.disabled = false;
  if (result.ok || result.status === 409) {
    const kept = rememberEvent({ ...cred, version: result.data.version });
    publishStatus.textContent = [result.ok ? '' : result.message, kept ? '' : copy.storageRefused].join(' ').trim();
    if (result.ok)
      showOutcome(publishedPanel, cred.version === null ? copy.publishedHeading : copy.changesPublishedHeading);
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
const shareEventLinkButton = /** @type {HTMLButtonElement} */ (document.getElementById('shareEventLink'));
shareEventLinkButton.hidden = !canShareLink;
shareEventLinkButton.addEventListener('click', () =>
  shareLinkNative(
    eventLinkInput.value,
    () => {
      publishStatus.textContent = copy.eventLinkShared;
    },
    () => {
      publishStatus.textContent = copy.eventLinkCopied;
    },
  ),
);
document.getElementById('copyManageLink').addEventListener('click', () =>
  copyLink(manageLinkInput.value, () => {
    publishStatus.textContent = copy.manageLinkCopied;
  }),
);

// Guest replies to a published event. The reply id and secret are made once per page. The guest view never writes
// storage, so the first send puts them in the address as the edit link #r=<id>.<secret> before the request. A retry
// or a reload after a lost confirmation then reuses them and cannot create a second reply. An edit link loads that
// reply, and saving sends its version. Withdrawing sends the version too and replaces the form with the withdrawn
// panel. Its Reply again button shows the empty form, with a new reply id and secret, so the next send makes a
// separate reply under a new edit link.
const rsvpForm = /** @type {HTMLFormElement} */ (document.getElementById('rsvpForm'));
const rsvpStatus = document.getElementById('rsvpStatus');
const replyLinkInput = /** @type {HTMLInputElement} */ (document.getElementById('replyLink'));
const sendReply = /** @type {HTMLButtonElement} */ (document.getElementById('sendReply'));
const nameInput = /** @type {HTMLInputElement} */ (document.getElementById('guestName'));
const partySizeInput = /** @type {HTMLInputElement} */ (document.getElementById('partySize'));
const noteInput = /** @type {HTMLTextAreaElement} */ (document.getElementById('guestNote'));
addCounter(nameInput, REPLY_LIMITS.name);
addCounter(noteInput, REPLY_LIMITS.note, { codePoints: true });
partySizeInput.max = String(REPLY_LIMITS.partySize);
const fromLink = readCredential(location.hash, 'r=');
const replyCred = { ...(fromLink ?? { id: newId(), secret: newSecret() }), version: null };
const withdrawButton = /** @type {HTMLButtonElement} */ (document.getElementById('withdrawReply'));
const replySavedPanel = document.getElementById('replySaved');
const withdrawnPanel = document.getElementById('replyWithdrawn');

// The checked answer as a boolean, or null when no choice is checked.
function attendingChecked() {
  const checked = /** @type {HTMLInputElement} */ (rsvpForm.querySelector('input[name="attending"]:checked'));
  return checked ? checked.value === 'yes' : null;
}

// Each reply field shows its own error in a message below it, which joins the field's description after any hint and
// counter. The answer's field is its radio group, and focus goes to the group's first choice.
const replyErrors = copy.replyErrors(REPLY_LIMITS);
/** @type {Record<string, {field: Element, focusTarget: HTMLElement}>} */
const replyControls = {
  name: { field: nameInput, focusTarget: nameInput },
  attending: {
    field: rsvpForm.querySelector('[role="radiogroup"]'),
    focusTarget: rsvpForm.querySelector('input[name="attending"]'),
  },
  partySize: { field: partySizeInput, focusTarget: partySizeInput },
  note: { field: noteInput, focusTarget: noteInput },
};
const replyFields = REPLY_FIELDS.map((name) => {
  const { field, focusTarget } = replyControls[name];
  const message = document.createElement('p');
  message.className = 'field-error';
  message.id = `${name}Error`;
  message.hidden = true;
  field.closest('.field').append(message);
  return { name, field, focusTarget, message, describedBy: field.getAttribute('aria-describedby') };
});

// Marks the fields named in invalid, clears the others and focuses the first invalid field.
function showReplyErrors(invalid) {
  for (const { name, field, message, describedBy } of replyFields) {
    const isInvalid = invalid.includes(name);
    message.hidden = !isInvalid;
    message.textContent = isInvalid ? replyErrors[name] : '';
    if (isInvalid) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
    const ids = [describedBy, isInvalid ? message.id : null].filter(Boolean);
    if (ids.length) field.setAttribute('aria-describedby', ids.join(' '));
    else field.removeAttribute('aria-describedby');
  }
  replyFields.find(({ name }) => invalid.includes(name))?.focusTarget.focus();
}

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
  noteInput.value = reply.note;
  syncPartySize();
  showCounts();
}

const replyLink = () => responseLink(location.origin, state.event, replyCred.id, replyCred.secret, lang);

function showReplyLink() {
  replyLinkInput.value = replyLink();
  replySavedPanel.hidden = false;
}

rsvpForm.addEventListener('change', syncPartySize);

rsvpForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const attending = attendingChecked();
  const { reply, invalid } = makeReply({
    name: nameInput.value,
    attending,
    partySize: attending ? Number(partySizeInput.value) : 0,
    // Text pasted from a spreadsheet can hold tabs, which makeReply refuses, so they become spaces.
    note: noteInput.value.replaceAll('\t', ' '),
  });
  showReplyErrors(invalid);
  setOutcome(replySavedPanel, null);
  if (!reply) {
    rsvpStatus.textContent = '';
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
  const created = replyCred.version === null;
  const result = await client.saveReply(state.event, replyCred, reply);
  sendReply.disabled = false;
  if (result.ok) {
    replyCred.version = result.data.version;
    replyLinkInput.value = replyLink();
    rsvpStatus.textContent = '';
    showOutcome(replySavedPanel, created ? copy.replySent : copy.replyUpdated);
    return;
  }
  if (result.status === 409) {
    replyCred.version = result.data.version;
    fillReply(result.data);
  }
  rsvpStatus.textContent = result.message;
});

// The withdraw button sits in the saved-reply panel, so it shows only once the server has confirmed a version.
withdrawButton.addEventListener('click', async () => {
  if (!window.confirm(copy.withdrawConfirm)) return;
  withdrawButton.disabled = true;
  setOutcome(replySavedPanel, null);
  rsvpStatus.textContent = copy.withdrawingReply;
  const result = await client.withdrawReply(state.event, replyCred);
  withdrawButton.disabled = false;
  if (result.ok) {
    Object.assign(replyCred, { id: newId(), secret: newSecret(), version: null });
    history.replaceState(null, '', eventLink(location.origin, state.event, lang));
    rsvpForm.reset();
    syncPartySize();
    showCounts();
    replySavedPanel.hidden = true;
    rsvpStatus.textContent = '';
    rsvpForm.hidden = true;
    withdrawnPanel.hidden = false;
    withdrawnPanel.focus();
    return;
  }
  if (result.status === 409) {
    replyCred.version = result.data.version;
    fillReply(result.data);
  }
  rsvpStatus.textContent = result.message;
});

document.getElementById('replyAgain').addEventListener('click', () => {
  withdrawnPanel.hidden = true;
  rsvpForm.hidden = false;
  nameInput.focus();
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
    eventLink(location.origin, state.event, lang),
    lang,
  );
  document.getElementById('reportRow').hidden = false;
  if (!fromLink) return;
  const saved = await client.loadReply(state.event, replyCred);
  // The event exists, so the reply was never saved or was withdrawn. The empty form sends it as a new reply.
  if (saved.status === 404) {
    rsvpStatus.textContent = copy.noSavedReply;
    return;
  }
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
