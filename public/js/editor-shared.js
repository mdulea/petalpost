// Shared UI helpers used by both the host editor and the guest view of editor.html / ro/editor.html.
import { localeOf } from './i18n.js';
import { eventPreviewMeta } from './invite.js';
import { animate } from './motion.js';
import { mountInvites } from './mount.js';
import { getTemplate, renderInvite, renderSchedule } from './templates.js';

// Confirmation panels and the guest view's invitation fade in and rise 12px.
export const RISE = [
  { opacity: 0, transform: 'translateY(12px)' },
  { opacity: 1, transform: 'none' },
];

export const canShareLink = typeof navigator.share === 'function';

// Renders the invitation card and its sub-event schedule list.
export function renderInviteCard(previewCard, state, lang, locale) {
  mountInvites(previewCard, renderInvite(getTemplate(state.t, lang), { ...state.d, photo: state.photo }, { locale }));
  const schedule = renderSchedule(state.d, locale);
  document.getElementById('scheduleList').innerHTML = schedule;
  document.getElementById('schedule').hidden = !schedule;
}

// Status line controller where transient messages clear after 4 seconds unless keep is set.
export function createStatus(statusEl) {
  /** @type {ReturnType<typeof setTimeout>} */
  let timer;
  return function setStatus(text, { keep = false } = {}) {
    statusEl.textContent = text;
    clearTimeout(timer);
    if (!keep) {
      timer = setTimeout(() => {
        statusEl.textContent = '';
      }, 4000);
    }
  };
}

// Copies the link and then calls done, or shows the link in a prompt where the clipboard is blocked.
export async function copyLink(url, copyPrompt, done) {
  try {
    await navigator.clipboard.writeText(url);
    done();
  } catch {
    window.prompt(copyPrompt, url);
  }
}

// Shares a link through the device share sheet, falling back to clipboard copy on non-abort failure.
export async function shareLinkNative(state, lang, copyPrompt, url, onShared, onCopied) {
  const meta = eventPreviewMeta(state.d, localeOf(lang));
  try {
    await navigator.share({ title: meta.title, text: meta.description, url });
    onShared();
  } catch (error) {
    if (error?.name === 'AbortError') return;
    await copyLink(url, copyPrompt, onCopied);
  }
}

// Confirmation panels fade in, rise 12px over 250ms, and take focus for screen readers and keyboard users.
export function openPanel(panel) {
  panel.hidden = false;
  animate([panel], RISE, { duration: 250, easing: 'ease-out' });
  panel.focus();
}

export function setOutcome(panel, heading) {
  const outcome = /** @type {HTMLElement} */ (panel.querySelector('.outcome'));
  outcome.hidden = !heading;
  outcome.textContent = heading ?? '';
}

export function showOutcome(panel, heading) {
  setOutcome(panel, heading);
  openPanel(panel);
}
