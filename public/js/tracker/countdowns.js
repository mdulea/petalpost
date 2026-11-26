// Shows the countdowns to the RSVP deadline and to the deletion of a guest list, and refreshes them each minute.
// trackerDue in countdown.js decides when each one turns into a nudge, which adds what the host should do.
import { trackerDue } from '../countdown.js';
import { partyTotals } from '../guest-list.js';
import { UI } from '../i18n.js';

/** @type {ReturnType<typeof setInterval>} */
let timer;

// Shows one countdown line, or hides it once the countdown has ended. A nudge shows as a warning with action.
function showLine(el, due, text, action) {
  el.hidden = !due;
  if (!due) return;
  el.className = due.nudge ? 'warning' : 'hint';
  el.textContent = due.nudge ? `${text(due.left)} ${action}` : text(due.left);
}

function show({ d, parties }, { lang }) {
  const words = UI[lang].countdowns;
  const { pending } = partyTotals(parties);
  const deletionText = (left) => (left ? words.deletion(left) : words.deletionDue);
  const refresh = () => {
    const due = trackerDue(d, pending, new Date());
    showLine(document.getElementById('deadlineCountdown'), due.deadline, words.deadline, words.pending(pending));
    showLine(document.getElementById('deletionCountdown'), due.deletion, deletionText, words.download);
    return Boolean(due.deadline || due.deletion?.left);
  };
  clearInterval(timer);
  if (refresh()) {
    timer = setInterval(() => {
      if (!refresh()) clearInterval(timer);
    }, 60 * 1000);
  }
}

export const section = { id: 'countdowns', modes: ['guestList'], show };
