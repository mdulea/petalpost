// The tracker section for sharing the public invitation link or the private management link.
import { localeOf } from '../i18n.js';
import { MODES, eventLink, whatsappLink } from '../invite.js';
import { manageLink } from '../rsvp.js';

const input = () => /** @type {HTMLInputElement} */ (document.getElementById('eventLink'));
const shareButtons = () => document.querySelectorAll('button[data-share-management]');

function init({ copy, lang, cred, signedIn, setStatus }) {
  document.getElementById('copyEventLink').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(input().value);
      setStatus(copy.eventLinkCopied);
    } catch {
      window.prompt(copy.copyPrompt, input().value);
    }
  });
  if (signedIn) return;
  for (const button of shareButtons()) {
    button.addEventListener('click', async () => {
      const url = manageLink(location.origin, cred.id, cred.secret, lang);
      if (typeof navigator.share === 'function') {
        try {
          await navigator.share({ url });
          return;
        } catch (error) {
          if (error?.name === 'AbortError') return;
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        setStatus(copy.managementLinkCopied);
      } catch {
        window.prompt(copy.copyPrompt, url);
      }
    });
  }
}

function show({ invite, mode }, { lang, cred, signedIn }) {
  input().value = eventLink(location.origin, cred.id, lang);
  /** @type {HTMLAnchorElement} */ (document.getElementById('whatsappEventLink')).href = whatsappLink(
    invite,
    localeOf(lang),
    input().value,
  );
  document.getElementById('eventLinkNoReplies').hidden = mode !== 'guestList';
  document.getElementById('managementShareWarning').hidden = signedIn;
  document.getElementById('managementShareHint').hidden = !signedIn;
  for (const button of shareButtons()) {
    button.toggleAttribute('disabled', signedIn);
    if (signedIn) button.setAttribute('aria-describedby', 'managementShareHint');
  }
}

export const section = { id: 'invitationLink', modes: MODES, init, show };
