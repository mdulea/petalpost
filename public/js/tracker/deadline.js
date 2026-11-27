// Sets, changes and clears the optional RSVP deadline of a guest-list invitation in the tracker.
import { isDeadlinePassed } from '../countdown.js';
import { UI } from '../i18n.js';
import { formatDate } from '../templates.js';

function init({ client, cred, lang, signedIn, runAction }) {
  const form = /** @type {HTMLFormElement} */ (document.getElementById('deadlineForm'));
  const clear = /** @type {HTMLButtonElement} */ (document.getElementById('clearDeadline'));
  const status = document.getElementById('deadlineStatus');
  form.hidden = signedIn;
  document.getElementById('deadlineManagementLinkRequired').hidden = !signedIn;
  if (signedIn) return;
  const input = /** @type {HTMLInputElement} */ (document.getElementById('deadlineDate'));
  const words = UI[lang].deadline;

  const save = (value) =>
    runAction({
      controls: form.elements,
      setStatus: (text) => {
        status.textContent = text;
      },
      action: async () => {
        const result = await client.setDeadline(cred, value);
        return result.ok ? { ...result, message: result.data.deadline ? words.saved : words.cleared } : result;
      },
      reload: 'ok',
    });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    save(input.value || null);
  });
  clear.addEventListener('click', () => save(null));
}

function show({ d }, { lang, locale, signedIn }) {
  const words = UI[lang].deadline;
  const summary = document.getElementById('deadlineSummary');
  const deadline = d?.deadline ?? '';
  if (!deadline) {
    summary.textContent = words.none;
  } else {
    const formatted = formatDate(deadline, locale);
    summary.textContent = isDeadlinePassed(deadline) ? words.closed(formatted) : words.open(formatted);
  }
  if (signedIn) return;
  /** @type {HTMLInputElement} */ (document.getElementById('deadlineDate')).value = deadline;
  document.getElementById('clearDeadline').hidden = !deadline;
}

export const section = { id: 'rsvpDeadline', modes: ['guestList'], init, show };
