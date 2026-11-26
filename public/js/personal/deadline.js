// Shows the RSVP deadline on the personal link page, and whether replies are closed.
import { UI } from '../i18n.js';
import { formatDate } from '../templates.js';

export function renderDeadline(party, { lang, locale }) {
  const deadline = party.d?.deadline;
  if (!deadline) return null;
  const words = UI[lang].deadline;
  const formatted = formatDate(deadline, locale);
  const panel = document.createElement('section');
  panel.className = 'panel';
  panel.id = 'personalDeadline';
  const text = document.createElement('p');
  text.className = 'status';
  text.textContent = party.deadlineClosed ? words.guestClosed(formatted) : words.guestOpen(formatted);
  panel.append(text);
  return panel;
}
