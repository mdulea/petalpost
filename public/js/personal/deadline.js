// Shows the RSVP deadline on the personal link page, and whether replies are closed. While replies are open, it adds
// the time left before the deadline and refreshes it each minute, until the deadline passes or reply.js replaces the
// text with a closed message.
import { countdown, deadlineEnd } from '../countdown.js';
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
  panel.append(text);
  if (party.deadlineClosed) {
    text.textContent = words.closed(formatted);
    return panel;
  }
  const left = document.createElement('span');
  left.id = 'personalDeadlineCountdown';
  text.append(words.guestOpen(formatted), ' ', left);
  const end = deadlineEnd(deadline);
  const refresh = () => {
    const due = countdown(end, new Date());
    left.textContent = due ? UI[lang].countdowns.deadline(due) : '';
    return Boolean(due);
  };
  if (refresh()) {
    const timer = setInterval(() => {
      if (!left.isConnected || !refresh()) clearInterval(timer);
    }, 60 * 1000);
  }
  return panel;
}
