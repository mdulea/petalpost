import './icons.js';
import './language-banner.js';
import { UI, accentLabel, categoryLabel, localeOf, normalizeLang } from './i18n.js';
import { ACCENTS, categoriesFor, getTemplate, renderInvite, renderSchedule, templatesFor } from './templates.js';
import { mountInvites } from './mount.js';
import { animate } from './motion.js';
import { countdown, eventStart } from './countdown.js';
import { showPersonalSections } from './personal/sections.js';
import {
  EDITABLE,
  FIELDS,
  FIELD_LIMITS,
  MAX_SUB_EVENTS,
  SUB_EVENT_LIMITS,
  addSubEvent,
  buildIcs,
  charsLeft,
  changePhoto,
  eventLink,
  eventPreviewMeta,
  makeInviteData,
  mapLink,
  moveSubEvent,
  openInvite,
  removeSubEvent,
  reportLink,
  resetInvite,
  saveDraft,
  savePublishedEvent,
  shareLink,
  storedPublishedEvent,
  slug,
  storedInvite,
  subEventLabels,
  switchTemplate,
  updateInvite,
  updateSubEvent,
  whatsappLink,
} from './invite.js';
import {
  REPLY_FIELDS,
  REPLY_LIMITS,
  createClient,
  createCounter,
  editorPage,
  makeReply,
  manageLink,
  newId,
  newSecret,
  partyLinkPrefix,
  readCredential,
  responseLink,
  viewLink,
  viewLinkSecret,
} from './rsvp.js';
import { answerFields } from './sub-event-answers.js';

const lang = normalizeLang(document.documentElement.lang);
const locale = lang === 'ro' ? localeOf('ro') : undefined;
const editorCopy = UI[lang].editor;
const guestCopy = UI[lang].guest;
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
const countAction = createCounter((url, data) => navigator.sendBeacon(url, data), lang);

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
  const schedule = renderSchedule(state.d, locale);
  document.getElementById('scheduleList').innerHTML = schedule;
  document.getElementById('schedule').hidden = !schedule;
}

function commit() {
  render();
  save();
}

// A template or accent change settles the preview from opacity 0.6 to 1 over 180ms. A text edit does not animate.
function settlePreview() {
  animate([previewCard], [{ opacity: 0.6 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
}

// The guest view's invitation and the confirmation panels fade in and rise 12px.
const RISE = [
  { opacity: 0, transform: 'translateY(12px)' },
  { opacity: 1, transform: 'none' },
];

// The guest view reveals the invitation over 400ms, once when the page shows it.
function revealInvite() {
  animate([previewCard], RISE, { duration: 400, easing: 'ease-out' });
}

// The guest view shows the time left before the event and refreshes it each minute. It hides once the event starts
// and shows nothing for an invite without a date. The text changes without animation.
const countdownEl = document.getElementById('countdown');
/** @type {ReturnType<typeof setInterval>} */
let countdownTimer;
function showCountdown() {
  const start = eventStart(state.d);
  const refresh = () => {
    const left = countdown(start, new Date());
    countdownEl.hidden = !left;
    if (left) countdownEl.textContent = guestCopy.countdown(left);
    else clearInterval(countdownTimer);
  };
  clearInterval(countdownTimer);
  refresh();
  if (!countdownEl.hidden) countdownTimer = setInterval(refresh, 60 * 1000);
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
    if (entry.count >= limit && before < limit) limitAlert.textContent = editorCopy.charsLeft(0);
  });
}

// Writes each counter from its field's value and clears the live region; call after a script sets field values.
function showCounts() {
  limitAlert.textContent = '';
  counters.forEach((entry, input) => {
    entry.count = entry.length(input.value);
    const left = charsLeft(entry.count, entry.limit);
    entry.counter.hidden = left === null;
    entry.counter.textContent = left === null ? '' : editorCopy.charsLeft(left);
  });
}

// The accent radio group takes its value too: a null accent checks the template default swatch.
function fillForm() {
  EDITABLE.forEach((f) => {
    form.elements[f].value = state.d[f] ?? '';
  });
  fillSubEvents();
  showCounts();
}

// The sub-event fields, one fieldset for each sub-event in order. Each input carries the sub-event's index and field
// name, and each button its action. The inputs have no name, so updateInvite ignores them. A redraw follows only an
// add, a move, a removal or a fill, so typing keeps the focused input.
const subEventList = document.getElementById('subEvents');
const addSubEventButton = /** @type {HTMLButtonElement} */ (document.getElementById('addSubEvent'));
const SUB_EVENT_INPUTS = { name: 'text', date: 'date', time: 'time', venue: 'text' };

function fillSubEvents() {
  const list = state.d.subEvents ?? [];
  subEventList.innerHTML = list
    .map((_, i) => {
      const text = UI[lang].subEvents.part(i + 1);
      const input = (f) => `<div class="field">
          <label for="sub${i}-${f}">${text[f]}</label>
          <input class="input" type="${SUB_EVENT_INPUTS[f]}" id="sub${i}-${f}" data-index="${i}" data-field="${f}" />
        </div>`;
      const button = (action, disabled) =>
        `<button class="btn btn-ghost btn-small" type="button" data-index="${i}" data-action="${action}"
          aria-label="${text[`${action}Label`]}"${disabled ? ' disabled' : ''}>${text[action]}</button>`;
      return `<li class="sub-event"><fieldset>
        <legend>${text.legend}</legend>
        ${input('name')}
        <div class="field-row">${input('date')}${input('time')}</div>
        ${input('venue')}
        <div class="sub-event-tools">
          ${button('up', i === 0)}${button('down', i === list.length - 1)}${button('remove', false)}
        </div>
      </fieldset></li>`;
    })
    .join('');
  subEventList.querySelectorAll('input').forEach((/** @type {HTMLInputElement} */ el) => {
    const limit = SUB_EVENT_LIMITS[el.dataset.field];
    if (limit) el.maxLength = limit;
    el.value = list[Number(el.dataset.index)][el.dataset.field];
  });
  addSubEventButton.disabled = list.length >= MAX_SUB_EVENTS;
}

addSubEventButton.addEventListener('click', () => {
  if (!addSubEvent(state, lang)) return;
  fillSubEvents();
  commit();
  /** @type {HTMLElement} */ (subEventList.querySelector('li:last-child input')).focus();
});

// A moved sub-event keeps focus on the same button, or on its other move button at the end of the list. After a
// removal, focus goes to the next sub-event's name, the previous one's at the end, or the add button.
subEventList.addEventListener('click', (e) => {
  const button = /** @type {HTMLButtonElement} */ (/** @type {Element} */ (e.target).closest('button[data-action]'));
  if (!button) return;
  const index = Number(button.dataset.index);
  const { action } = button.dataset;
  const offset = action === 'up' ? -1 : 1;
  const changed = action === 'remove' ? removeSubEvent(state, index, lang) : moveSubEvent(state, index, offset, lang);
  if (!changed) return;
  fillSubEvents();
  commit();
  const items = subEventList.children;
  if (action === 'remove') {
    const next = items[index] ?? items[index - 1];
    /** @type {HTMLElement} */ (next?.querySelector('input') ?? addSubEventButton).focus();
    return;
  }
  const moved = items[index + offset];
  const same = /** @type {HTMLButtonElement} */ (moved.querySelector(`[data-action="${action}"]`));
  /** @type {HTMLElement} */ (same.disabled ? moved.querySelector('[data-action]:not(:disabled)') : same).focus();
});

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
  `<label class="swatch swatch-default" title="${editorCopy.defaultSwatch}"><input type="radio" name="accent" value="" aria-label="${editorCopy.defaultSwatch}"></label>` +
  ACCENTS.map((a) => {
    const label = accentLabel(a.hex, lang);
    return `
    <label class="swatch" style="background:${a.hex}" title="${label}">
      <input type="radio" name="accent" value="${a.hex}" aria-label="${label}">
    </label>`;
  }).join('');

form.addEventListener('input', (e) => {
  const { name, value, dataset } = /** @type {HTMLInputElement} */ (e.target);
  if (dataset.field) {
    if (updateSubEvent(state, Number(dataset.index), dataset.field, value, lang)) commit();
    return;
  }
  if (name === 'template') {
    switchTemplate(state, value, lang);
    fillForm();
  } else if (!updateInvite(state, name, value, lang)) {
    return;
  }
  commit();
  if (name === 'template' || name === 'accent') settlePreview();
});

// On narrow layouts the floating Preview button covers the bottom of the screen. The browser scrolls a focused
// control into view only when it is off screen. Wait two frames for the browser's focus scroll before clearing
// the button. Hidden radios and the file input show through their label.
const jumpPreview = document.querySelector('.jump-preview');
form.addEventListener('focusin', (e) => {
  const target = /** @type {HTMLElement} */ (e.target);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (document.activeElement !== target) return;
      const cover = jumpPreview.getBoundingClientRect();
      const rect = (target.closest('label') ?? target).getBoundingClientRect();
      const overlaps = rect.left < cover.right && cover.left < rect.right && rect.bottom > cover.top;
      if (cover.height && overlaps) scrollBy({ top: rect.bottom - cover.top + 16, behavior: 'instant' });
    });
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
    setStatus(editorCopy.chooseImage);
    return;
  }
  const result = await changePhoto(state, file === null ? null : decodePhoto(file), storage, lang);
  if (result === 'superseded') return;
  if (result === 'refused') {
    setStatus(editorCopy.imageRefused);
    return;
  }
  commit();
  if (file === null) setStatus('');
  else if (result === 'saved') setStatus(editorCopy.photoAdded, { keep: true });
  else setStatus(editorCopy.photoTooLarge, { keep: true });
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
  if (!window.confirm(editorCopy.resetConfirm)) return;
  resetInvite(state, lang);
  fillForm();
  commit();
  setStatus(editorCopy.resetDone);
});

// Copies the link and then calls done, or shows the link in a prompt where the clipboard is blocked.
async function copyLink(url, done) {
  try {
    await navigator.clipboard.writeText(url);
    done();
  } catch {
    window.prompt(editorCopy.copyPrompt, url);
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
    setStatus(editorCopy.imageToolLoading);
    return;
  }
  button.disabled = true;
  setStatus(editorCopy.preparingImage, { keep: true });
  try {
    downloadDataUrl(await renderPng(), `${slug(state.d.title)}.png`);
    countAction('png_download');
    setStatus(editorCopy.downloaded);
  } catch {
    setStatus(editorCopy.downloadFailed);
  } finally {
    button.disabled = false;
  }
});

const sharePngButton = /** @type {HTMLButtonElement} */ (document.getElementById('sharePng'));
sharePngButton.hidden = !canShareFile;
sharePngButton.addEventListener('click', async () => {
  if (typeof htmlToImage !== 'object') {
    setStatus(editorCopy.imageToolLoading);
    return;
  }
  sharePngButton.disabled = true;
  setStatus(editorCopy.preparingImage, { keep: true });
  let dataUrl;
  try {
    dataUrl = await renderPng();
  } catch {
    setStatus(editorCopy.downloadFailed);
    sharePngButton.disabled = false;
    return;
  }
  const filename = `${slug(state.d.title)}.png`;
  try {
    const file = dataUrlToFile(dataUrl, filename);
    await navigator.share({ files: [file], title: eventPreviewMeta(state.d, localeOf(lang)).title });
    countAction('png_share');
    setStatus(editorCopy.inviteShared);
  } catch (error) {
    if (error?.name === 'AbortError') {
      setStatus('');
    } else {
      downloadDataUrl(dataUrl, filename);
      countAction('png_download');
      setStatus(editorCopy.downloaded);
    }
  } finally {
    sharePngButton.disabled = false;
  }
});

// Guest view: calendar file built from the invite fields.
document.getElementById('addCalendar').addEventListener('click', () => {
  const ics = buildIcs(state.d, new Date());
  if (!ics) {
    setStatus(editorCopy.noDate);
    return;
  }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  link.download = `${slug(state.d.title)}.ics`;
  link.click();
  // Only guests of a published invitation count. The sample invitation and the host's preview send nothing.
  if (state.event) countAction('calendar_add');
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

// The first publish takes the identity that another tab may have stored since this page opened. Without one, it
// creates the event identity and stores it before the request, so a retry after a lost confirmation reuses the id
// and secret. Later publishes send the version. Nothing reaches the server without a click on Publish.
const publishButton = /** @type {HTMLButtonElement} */ (document.getElementById('publish'));
const publishStatus = document.getElementById('publishStatus');
const eventLinkInput = /** @type {HTMLInputElement} */ (document.getElementById('eventLink'));
const whatsappEventLink = /** @type {HTMLAnchorElement} */ (document.getElementById('whatsappEventLink'));
const manageLinkInput = /** @type {HTMLInputElement} */ (document.getElementById('manageLink'));
const publishedPanel = document.getElementById('published');

// A confirmation panel shows the result of the action that just succeeded. It fades in and rises 12px over 250ms,
// and focus moves to it, so a screen reader reads it and a keyboard continues from it.
function openPanel(panel) {
  panel.hidden = false;
  animate([panel], RISE, { duration: 250, easing: 'ease-out' });
  panel.focus();
}

// The .outcome heading of a confirmation panel names the outcome. A panel that shows saved state, such as the links
// after a reload, keeps its heading hidden, and so does a panel whose last action failed.
function showOutcome(panel, heading) {
  setOutcome(panel, heading);
  openPanel(panel);
}

function setOutcome(panel, heading) {
  const outcome = /** @type {HTMLElement} */ (panel.querySelector('.outcome'));
  outcome.hidden = !heading;
  outcome.textContent = heading ?? '';
}

// The links show once the server has confirmed the event; until then the stored identity waits for a retry. The
// tracker changes the stored mode, so the editor's mode choice locks once the event is live.
function showPublished() {
  const cred = state.publishedEvent;
  const live = Boolean(cred && cred.version !== null);
  form.querySelectorAll('input[name="mode"]').forEach((/** @type {HTMLInputElement} */ input) => {
    input.disabled = live;
  });
  publishedPanel.hidden = !live;
  if (!live) setOutcome(publishedPanel, null);
  publishButton.lastChild.textContent = live ? editorCopy.publishChanges : editorCopy.publish;
  eventLinkInput.value = live ? eventLink(location.origin, cred.id, lang) : '';
  whatsappEventLink.href = live ? whatsappLink(state.d, localeOf(lang), eventLinkInput.value) : '#';
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
  if (state.d.mode === 'guestList' && !state.d.date) {
    publishStatus.textContent = editorCopy.guestListDate;
    document.getElementById('date').focus();
    return;
  }
  state.publishedEvent ??= storedPublishedEvent(storage, lang);
  if (!state.publishedEvent) rememberEvent({ id: newId(), secret: newSecret(), version: null });
  const cred = state.publishedEvent;
  publishButton.disabled = true;
  publishStatus.textContent = editorCopy.publishing;
  setOutcome(publishedPanel, null);
  const result = await client.publish(cred, state);
  publishButton.disabled = false;
  if (result.ok || result.status === 409) {
    const kept = rememberEvent({ ...cred, version: result.data.version });
    publishStatus.textContent = [result.ok ? '' : result.message, kept ? '' : editorCopy.storageRefused]
      .join(' ')
      .trim();
    if (result.ok)
      showOutcome(
        publishedPanel,
        cred.version === null ? editorCopy.publishedHeading : editorCopy.changesPublishedHeading,
      );
  } else if (result.status === 410 || (result.status === 404 && cred.version !== null)) {
    rememberEvent(null);
    publishStatus.textContent = result.status === 410 ? result.message : editorCopy.deletedOnServer;
  } else {
    publishStatus.textContent = result.message;
  }
});

document.getElementById('copyEventLink').addEventListener('click', () =>
  copyLink(eventLinkInput.value, () => {
    countAction('invitation_link_copy');
    publishStatus.textContent = editorCopy.eventLinkCopied;
  }),
);
const shareEventLinkButton = /** @type {HTMLButtonElement} */ (document.getElementById('shareEventLink'));
shareEventLinkButton.hidden = !canShareLink;
shareEventLinkButton.addEventListener('click', () =>
  shareLinkNative(
    eventLinkInput.value,
    () => {
      countAction('invitation_link_share');
      publishStatus.textContent = editorCopy.eventLinkShared;
    },
    () => {
      countAction('invitation_link_copy');
      publishStatus.textContent = editorCopy.eventLinkCopied;
    },
  ),
);
document.getElementById('copyManageLink').addEventListener('click', () =>
  copyLink(manageLinkInput.value, () => {
    publishStatus.textContent = editorCopy.manageLinkCopied;
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
const isReplyEdit = location.hash.startsWith('#r=');
const partyPrefix = partyLinkPrefix(location.hash);
const replyCred = { ...(fromLink ?? { id: newId(), secret: newSecret() }), version: null };
const withdrawButton = /** @type {HTMLButtonElement} */ (document.getElementById('withdrawReply'));
const replySavedPanel = document.getElementById('replySaved');
const withdrawnPanel = document.getElementById('replyWithdrawn');

// The checked answer as a boolean, or null when no choice is checked.
function attendingChecked() {
  const checked = /** @type {HTMLInputElement} */ (rsvpForm.querySelector('input[name="attending"]:checked'));
  return checked ? checked.value === 'yes' : null;
}

// An invitation with sub-events asks for an answer to each in place of the single answer and party size. The answer
// fields are made once the invitation loads, in a field of their own before the note.
const attendingField = /** @type {HTMLElement} */ (rsvpForm.querySelector('[role="radiogroup"]'));
const answersField = document.createElement('div');
answersField.className = 'field';
answersField.hidden = true;
noteInput.closest('.field').before(answersField);
/** @type {ReturnType<typeof answerFields> | null} */
let answers = null;
let answerIds = [];

function prepareAnswers() {
  const labels = subEventLabels(state.d, lang);
  if (!labels.length) return;
  answerIds = labels.map(({ id }) => id);
  answers = answerFields(labels, { prefix: 'answer', limit: REPLY_LIMITS.partySize, lang });
  answers.fill(null, 1);
  answersField.prepend(answers.element);
  answersField.hidden = false;
  attendingField.hidden = true;
  /** @type {HTMLElement} */ (partySizeInput.closest('.field')).hidden = true;
}

// Each reply field shows its own error in a message below it, which joins the field's description after any hint and
// counter. The answer's field is its radio group, and focus goes to the group's first choice.
const replyErrors = {
  ...guestCopy.replyErrors(REPLY_LIMITS),
  answers: UI[lang].subEventReplies.error(REPLY_LIMITS.partySize),
};
/** @type {Record<string, {field: Element, focusTarget: () => HTMLElement}>} */
const replyControls = {
  name: { field: nameInput, focusTarget: () => nameInput },
  attending: {
    field: attendingField,
    focusTarget: () => rsvpForm.querySelector('input[name="attending"]'),
  },
  partySize: { field: partySizeInput, focusTarget: () => partySizeInput },
  answers: { field: answersField, focusTarget: () => answers?.focusTarget },
  note: { field: noteInput, focusTarget: () => noteInput },
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
  replyFields
    .find(({ name }) => invalid.includes(name))
    ?.focusTarget()
    .focus();
}

// A declined reply has no party; the size input keeps its number for a change of mind.
function syncPartySize() {
  partySizeInput.disabled = !attendingChecked();
}

function fillReply(reply) {
  nameInput.value = reply.name;
  answers?.fill(reply, 1);
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
  const { reply, invalid } = makeReply(
    {
      name: nameInput.value,
      attending,
      partySize: attending ? Number(partySizeInput.value) : 0,
      answers: answers?.read(),
      // Text pasted from a spreadsheet can hold tabs, which makeReply refuses, so they become spaces.
      note: noteInput.value.replaceAll('\t', ' '),
    },
    { subEventIds: answerIds },
  );
  showReplyErrors(invalid);
  setOutcome(replySavedPanel, null);
  if (!reply) {
    rsvpStatus.textContent = '';
    return;
  }
  if (state.sample) {
    rsvpStatus.textContent = guestCopy.sampleReply;
    return;
  }
  // The edit link replaces the address before the request, so a reload or bookmark opens the reply if it was saved.
  history.replaceState(null, '', replyLink());
  sendReply.disabled = true;
  rsvpStatus.textContent = guestCopy.sendingReply;
  const created = replyCred.version === null;
  const result = await client.saveReply(state.event, replyCred, reply);
  sendReply.disabled = false;
  if (result.ok) {
    replyCred.version = result.data.version;
    showReplyLink();
    rsvpStatus.textContent = '';
    showOutcome(replySavedPanel, created ? guestCopy.replySent : guestCopy.replyUpdated);
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
  if (!window.confirm(guestCopy.withdrawConfirm)) return;
  withdrawButton.disabled = true;
  setOutcome(replySavedPanel, null);
  rsvpStatus.textContent = guestCopy.withdrawingReply;
  const result = await client.withdrawReply(state.event, replyCred);
  withdrawButton.disabled = false;
  if (result.ok) {
    Object.assign(replyCred, { id: newId(), secret: newSecret(), version: null });
    history.replaceState(null, '', eventLink(location.origin, state.event, lang));
    rsvpForm.reset();
    answers?.fill(null, 1);
    syncPartySize();
    showCounts();
    replySavedPanel.hidden = true;
    rsvpStatus.textContent = '';
    rsvpForm.hidden = true;
    openPanel(withdrawnPanel);
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
    rsvpStatus.textContent = guestCopy.replyLinkCopied;
  }),
);

// The guest view hides the editor heading visually; the invite title becomes the page heading.
function setHeading(heading) {
  document.title = `${heading} | Petalpost`;
  document.querySelector('.editor-head h1').textContent = heading;
}

// An invitation link shows nothing of the invite until the event loads, and only a message when loading fails.
async function openEvent() {
  const credential = partyPrefix && readCredential(location.hash, partyPrefix);
  const viewOnly = partyPrefix === 'v=';
  const copy = UI[lang].personal;
  const unavailable = (message, heading = guestCopy.loadFailedHeading) => {
    setHeading(heading);
    setStatus(message, { keep: true });
    document.body.classList.add('invite-hidden');
    for (const id of ['personalSections', 'countdown', 'replyCta', 'reportRow']) {
      document.getElementById(id).hidden = true;
    }
    clearInterval(countdownTimer);
  };
  if (partyPrefix && !credential) {
    unavailable(copy.unavailable);
    return;
  }
  const loadParty = viewOnly ? client.loadPartyView : client.loadParty;
  const result = credential ? await loadParty(state.event, credential) : await client.loadEvent(state.event);
  if (!result.ok) {
    if (credential) {
      unavailable(result.message, result.status === 410 ? guestCopy.endedHeading : guestCopy.loadFailedHeading);
      return;
    }
    setHeading(
      result.status === 410
        ? guestCopy.endedHeading
        : result.status === 404
          ? guestCopy.missingHeading
          : guestCopy.loadFailedHeading,
    );
    setStatus(result.message, { keep: true });
    return;
  }
  const template = getTemplate(result.data.t, lang);
  state.t = template.id;
  state.d = makeInviteData(template, result.data.d, lang);
  setHeading(state.d.title || guestCopy.defaultGuestHeading);
  document.body.classList.remove('invite-hidden');
  render();
  revealInvite();
  showCountdown();
  /** @type {HTMLAnchorElement} */ (document.getElementById('reportLink')).href = reportLink(
    eventLink(location.origin, state.event, lang),
    lang,
  );
  document.getElementById('replyCta').hidden = false;
  document.getElementById('reportRow').hidden = false;
  if (credential) {
    const page = { client, eventId: state.event, credential, copy, guestCopy, lang, locale, unavailable };
    if (!viewOnly) {
      const url = viewLink(
        eventLink(location.origin, state.event, lang),
        credential.id,
        await viewLinkSecret(credential.secret, credential.id),
      );
      const copied = () => setStatus(copy.viewCopied);
      page.shareView = () => {
        if (canShareLink) return shareLinkNative(url, () => setStatus(copy.viewShared), copied);
        return copyLink(url, copied);
      };
    }
    showPersonalSections(result.data, page, viewOnly);
    return;
  }
  // The invitation link of a guest-list invitation takes no reply, so it shows a notice in place of the form.
  const takesReplies = state.d.mode === 'open';
  if (takesReplies) prepareAnswers();
  rsvpForm.hidden = !takesReplies;
  const guestListNotice = document.getElementById('guestListNotice');
  guestListNotice.hidden = takesReplies;
  if (!takesReplies) {
    if (isReplyEdit) guestListNotice.textContent = guestCopy.replyLinkUnavailable;
    return;
  }
  if (!fromLink) return;
  const saved = await client.loadReply(state.event, replyCred);
  // The event exists, so the reply was never saved or was withdrawn. The empty form sends it as a new reply.
  if (saved.status === 404) {
    rsvpStatus.textContent = guestCopy.noSavedReply;
    return;
  }
  if (!saved.ok) {
    rsvpStatus.textContent = saved.message;
    return;
  }
  replyCred.version = saved.data.version;
  fillReply(saved.data);
  showReplyLink();
  rsvpStatus.textContent = guestCopy.savedReplyShown;
}

// A broken link shows only the message and the link to make an invite; an invite without a title gets a generic one.
if (state.guest) {
  document.body.classList.add('view-mode');
  document.body.classList.toggle('invite-hidden', state.broken || Boolean(state.event));
  if (state.broken) {
    setHeading(guestCopy.brokenHeading);
    setStatus(guestCopy.brokenMessage, { keep: true });
  } else if (state.event) {
    setHeading(guestCopy.openingHeading);
    openEvent();
    window.addEventListener('hashchange', () => {
      if (partyPrefix || partyLinkPrefix(location.hash) || isReplyEdit || location.hash.startsWith('#r=')) {
        location.reload();
      }
    });
  } else if (state.sample) {
    setHeading(state.d.title || guestCopy.defaultGuestHeading);
    const sampleNotice = document.getElementById('sampleNotice');
    sampleNotice.textContent = guestCopy.sampleNotice;
    sampleNotice.hidden = false;
    prepareAnswers();
    rsvpForm.hidden = false;
    revealInvite();
    showCountdown();
  } else {
    setHeading(state.d.title || guestCopy.defaultGuestHeading);
    revealInvite();
    showCountdown();
  }
}

showPublished();
fillForm();
renderPicker(getTemplate(state.t, lang).category);
render();
