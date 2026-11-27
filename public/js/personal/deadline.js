// Shows the RSVP deadline on the personal link page, and whether replies are closed. Uses deadlineCountdown so the
// banner and server deadline check flip at the exact same Europe/Bucharest boundary, and coordinates mid-session
// closing through page.onDeadlineClosed and page.closeDeadline rather than cross-section DOM queries.
import { deadlineCountdown } from '../countdown.js';
import { UI } from '../i18n.js';
import { formatDate } from '../templates.js';

export function renderDeadline(party, { lang, locale, onDeadlineClosed, closeDeadline }) {
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
  const lead = document.createTextNode(words.guestOpen(formatted));
  const space = document.createTextNode(' ');
  const left = document.createElement('span');
  left.id = 'personalDeadlineCountdown';
  text.append(lead, space, left);

  /** @type {ReturnType<typeof setInterval> | null} */
  let timer = null;

  onDeadlineClosed((message) => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    lead.data = message || words.closed(formatted);
    space.data = '';
    left.textContent = '';
  });

  const refresh = () => {
    const due = deadlineCountdown(deadline, new Date());
    if (!due) {
      closeDeadline();
      return false;
    }
    left.textContent = UI[lang].countdowns.deadline(due);
    return true;
  };

  if (refresh()) {
    timer = setInterval(() => {
      if (!left.isConnected) {
        clearInterval(timer);
        timer = null;
        return;
      }
      refresh();
    }, 60 * 1000);
  }
  return panel;
}
