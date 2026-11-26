// The tracker section of the invitation link, with its copy and WhatsApp buttons. In the guest-list mode it says
// that the link takes no replies.
import { localeOf } from '../i18n.js';
import { eventLink, whatsappLink } from '../invite.js';

const input = () => /** @type {HTMLInputElement} */ (document.getElementById('eventLink'));

function init({ copy, setStatus }) {
  document.getElementById('copyEventLink').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(input().value);
      setStatus(copy.eventLinkCopied);
    } catch {
      window.prompt(copy.copyPrompt, input().value);
    }
  });
}

function show({ invite, mode }, { lang, cred }) {
  input().value = eventLink(location.origin, cred.id, lang);
  /** @type {HTMLAnchorElement} */ (document.getElementById('whatsappEventLink')).href = whatsappLink(
    invite,
    localeOf(lang),
    input().value,
  );
  document.getElementById('eventLinkNoReplies').hidden = mode !== 'guestList';
}

export const section = { id: 'invitationLink', modes: ['open', 'guestList'], init, show };
