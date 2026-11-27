// Host editor mode for editor.html and ro/editor.html. Initialized only when the page is opened by a host, so guest
// visits skip template gallery rendering, photo tooling, and editor form setup.
import { createClient, createCounter } from './api-client.js';
import {
  canShareLink,
  copyLink,
  createLimitAlert,
  createStatus,
  renderInviteCard,
  setOutcome,
  shareLinkNative,
  showOutcome,
} from './editor-shared.js';
import { UI, accentLabel, categoryLabel, localeOf } from './i18n.js';
import {
  EDITABLE,
  FIELDS,
  FIELD_LIMITS,
  MAX_MENU_OPTIONS,
  MAX_SUB_EVENTS,
  MENU_OPTION_LIMIT,
  SUB_EVENT_LIMITS,
  addMenuOption,
  addSubEvent,
  changePhoto,
  eventLink,
  eventPreviewMeta,
  makeInviteData,
  moveSubEvent,
  removeMenuOption,
  removeSubEvent,
  renameMenuOption,
  resetInvite,
  saveDraft,
  savePublishedEvent,
  shareLink,
  slug,
  storedPublishedEvent,
  switchTemplate,
  updateInvite,
  updateSubEvent,
  whatsappLink,
} from './invite.js';
import { animate } from './motion.js';
import { mountInvites } from './mount.js';
import { resolvePublishResult } from './publish-recovery.js';
import { attachCounter } from './reply-fields.js';
import { editorPage, manageLink, newId, newSecret } from './rsvp.js';
import { ACCENTS, categoriesFor, getTemplate, renderInvite, templatesFor } from './templates.js';

const SUB_EVENT_INPUTS = { name: 'text', date: 'date', time: 'time', venue: 'text' };

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

export function initHostEditor({ state, storage, lang, locale }) {
  const editorCopy = UI[lang].editor;
  const catalog = templatesFor(lang);
  const categories = categoriesFor(lang);

  const form = /** @type {HTMLFormElement} */ (document.getElementById('form'));
  const previewCard = document.getElementById('previewCard');
  const setStatus = createStatus(document.getElementById('status'));
  const pageBase = editorPage(location.origin, lang);
  const shareUrl = () => shareLink(pageBase, state);
  const client = createClient(fetch, { lang });
  const countAction = createCounter((url, data) => navigator.sendBeacon(url, data), lang);

  let saveTimer;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveDraft(state, storage, lang), 250);
  }

  function render() {
    renderInviteCard(previewCard, state, lang, locale);
    form.classList.toggle('has-photo', Boolean(state.photo));
    /** @type {HTMLAnchorElement} */ (document.getElementById('previewGuest')).href = shareUrl();
  }

  function commit() {
    render();
    save();
  }

  // A template or accent change settles the preview from opacity 0.6 to 1 over 180ms. A text edit does not animate.
  function settlePreview() {
    animate([previewCard], [{ opacity: 0.6 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
  }

  const limitAlert = createLimitAlert();
  const counters = FIELDS.filter((f) => FIELD_LIMITS[f]).map((f) =>
    attachCounter(form.elements[f], FIELD_LIMITS[f], { lang, liveRegion: limitAlert }),
  );
  const showCounts = () => {
    for (const c of counters) c.refresh();
  };

  // Sub-event list controls.
  const subEventList = document.getElementById('subEvents');
  const addSubEventButton = /** @type {HTMLButtonElement} */ (document.getElementById('addSubEvent'));

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

  // Menu option list controls.
  const menuList = document.getElementById('menuOptions');
  const addMenuOptionButton = /** @type {HTMLButtonElement} */ (document.getElementById('addMenuOption'));

  function fillMenu() {
    const list = state.d.menu ?? [];
    menuList.innerHTML = list
      .map((_, i) => {
        const text = UI[lang].menu.option(i + 1);
        return `<li class="field">
          <label for="menu${i}">${text.name}</label>
          <div class="copy-row">
            <input class="input" id="menu${i}" data-menu-index="${i}" maxlength="${MENU_OPTION_LIMIT}" />
            <button class="btn btn-ghost btn-small" type="button" data-menu-index="${i}"
              aria-label="${text.removeLabel}">${text.remove}</button>
          </div>
        </li>`;
      })
      .join('');
    menuList.querySelectorAll('input').forEach((/** @type {HTMLInputElement} */ el) => {
      el.value = list[Number(el.dataset.menuIndex)].name;
    });
    addMenuOptionButton.disabled = list.length >= MAX_MENU_OPTIONS;
  }

  addMenuOptionButton.addEventListener('click', () => {
    if (!addMenuOption(state, lang)) return;
    fillMenu();
    commit();
    /** @type {HTMLElement} */ (menuList.querySelector('li:last-child input')).focus();
  });

  menuList.addEventListener('click', (e) => {
    const button = /** @type {HTMLButtonElement} */ (
      /** @type {Element} */ (e.target).closest('button[data-menu-index]')
    );
    if (!button) return;
    const index = Number(button.dataset.menuIndex);
    if (!removeMenuOption(state, index, lang)) return;
    fillMenu();
    commit();
    const next = menuList.children[index] ?? menuList.children[index - 1];
    /** @type {HTMLElement} */ (next?.querySelector('input') ?? addMenuOptionButton).focus();
  });

  function fillForm() {
    EDITABLE.forEach((f) => {
      form.elements[f].value = state.d[f] ?? '';
    });
    fillSubEvents();
    fillMenu();
    showCounts();
  }

  // Template picker.
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
    if (dataset.menuIndex) {
      if (renameMenuOption(state, Number(dataset.menuIndex), value, lang)) commit();
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

  // On narrow layouts keep focused controls clear of the floating Preview button.
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
  photoInput.addEventListener('change', () => {
    if (photoInput.files[0]) loadPhoto(photoInput.files[0]);
    photoInput.value = '';
  });
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('is-over');
  });
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

  const canShareFile = (() => {
    if (!canShareLink || typeof navigator.canShare !== 'function') return false;
    try {
      return navigator.canShare({ files: [new File([], 'invite.png', { type: 'image/png' })] });
    } catch {
      return false;
    }
  })();

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

  // Publishing and recovery.
  const publishButton = /** @type {HTMLButtonElement} */ (document.getElementById('publish'));
  const publishStatus = document.getElementById('publishStatus');
  const eventLinkInput = /** @type {HTMLInputElement} */ (document.getElementById('eventLink'));
  const whatsappEventLink = /** @type {HTMLAnchorElement} */ (document.getElementById('whatsappEventLink'));
  const manageLinkInput = /** @type {HTMLInputElement} */ (document.getElementById('manageLink'));
  const publishedPanel = document.getElementById('published');

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
    const transition = resolvePublishResult(cred, result);
    if (transition.action === 'remember') {
      const kept = rememberEvent(transition.nextCred);
      publishStatus.textContent = [transition.message, kept ? '' : editorCopy.storageRefused].join(' ').trim();
      if (transition.outcome) {
        showOutcome(
          publishedPanel,
          transition.outcome === 'published' ? editorCopy.publishedHeading : editorCopy.changesPublishedHeading,
        );
      }
    } else if (transition.action === 'forget') {
      rememberEvent(null);
      publishStatus.textContent = transition.statusKind === 'deleted' ? editorCopy.deletedOnServer : transition.message;
    } else {
      publishStatus.textContent = transition.message;
    }
  });

  document.getElementById('copyEventLink').addEventListener('click', () =>
    copyLink(eventLinkInput.value, editorCopy.copyPrompt, () => {
      countAction('invitation_link_copy');
      publishStatus.textContent = editorCopy.eventLinkCopied;
    }),
  );
  const shareEventLinkButton = /** @type {HTMLButtonElement} */ (document.getElementById('shareEventLink'));
  shareEventLinkButton.hidden = !canShareLink;
  shareEventLinkButton.addEventListener('click', () =>
    shareLinkNative(
      state,
      lang,
      editorCopy.copyPrompt,
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
    copyLink(manageLinkInput.value, editorCopy.copyPrompt, () => {
      publishStatus.textContent = editorCopy.manageLinkCopied;
    }),
  );

  showPublished();
  fillForm();
  renderPicker(getTemplate(state.t, lang).category);
  render();
}
