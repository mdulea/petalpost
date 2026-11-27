// A personal-link reply stays on the same page for save, edit and withdrawal. Uses the unified reply-fields module
// and locks on mid-session deadline closing through the explicit page.onDeadlineClosed / page.closeDeadline seam.
import { menuLabels, subEventLabels } from '../invite.js';
import { createReplyFields } from '../reply-fields.js';
import { PARTY_LIMITS } from '../rsvp.js';

export function renderReply(
  party,
  { client, eventId, credential, copy, guestCopy, lang, unavailable, onDeadlineClosed, closeDeadline },
) {
  const form = document.createElement('form');
  form.className = 'panel rsvp';
  form.id = 'personalReply';
  form.autocomplete = 'off';
  form.noValidate = true;

  const heading = document.createElement('h2');
  heading.textContent = copy.heading;
  const fields = document.createElement('fieldset');
  fields.className = 'field';
  const replyFields = createReplyFields({
    lang,
    limit: PARTY_LIMITS.seats,
    subEvents: subEventLabels(party.d, lang),
    menu: menuLabels(party.d, lang),
    prefix: 'personal',
    answerPrefix: 'personalAnswer',
    mealPrefix: 'personalMeals',
    ids: { attending: 'personalAttending', seats: 'personalSeats', note: 'personalNote' },
    copy: {
      attending: copy.attending,
      yes: copy.yes,
      no: copy.no,
      seats: copy.seats,
      note: copy.note,
      noteHint: copy.noteHint,
    },
  });
  const actions = document.createElement('div');
  actions.className = 'reply-actions';
  const submit = document.createElement('button');
  submit.className = 'btn btn-primary';
  submit.type = 'submit';
  submit.textContent = copy.send;
  const withdraw = document.createElement('button');
  withdraw.className = 'btn btn-rose btn-small';
  withdraw.type = 'button';
  withdraw.hidden = true;
  withdraw.textContent = copy.withdraw;
  actions.append(submit, withdraw);
  fields.append(replyFields.fragment, actions);

  const status = document.createElement('p');
  status.className = 'status';
  status.setAttribute('role', 'status');
  form.append(heading, fields, status);
  replyFields.bind(form);

  const cred = { ...credential, version: undefined };
  let closed = Boolean(party.deadlineClosed);

  function lockClosed(message) {
    closed = true;
    fields.disabled = true;
    submit.hidden = true;
    withdraw.hidden = true;
    if (message) status.textContent = message;
  }

  onDeadlineClosed(lockClosed);

  function fill(reply) {
    cred.version = reply?.version;
    replyFields.fill(reply, party.defaultSeats);
    withdraw.hidden = closed || !reply;
  }

  function finish(result, success) {
    if (result.status === 409) fill(result.data.reply);
    if (result.status === 404 || result.status === 410) {
      unavailable(result.message, result.status === 410 ? guestCopy.endedHeading : guestCopy.loadFailedHeading);
      return;
    }
    if (result.status === 403) {
      closeDeadline(result.message);
      return;
    }
    fields.disabled = false;
    status.textContent = result.ok ? success : result.message;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (fields.disabled) return;
    const { reply, errorMessage, focusTarget } = replyFields.validate(party.name);
    if (!reply) {
      status.textContent = errorMessage;
      focusTarget?.focus();
      return;
    }
    fields.disabled = true;
    status.textContent = guestCopy.sendingReply;
    const first = cred.version === undefined;
    const result = await client.savePartyReply(eventId, cred, reply);
    if (result.ok) {
      cred.version = result.data.version;
      withdraw.hidden = false;
    }
    finish(result, first ? guestCopy.replySent : guestCopy.replyUpdated);
  });

  withdraw.addEventListener('click', async () => {
    if (fields.disabled || !window.confirm(guestCopy.withdrawConfirm)) return;
    fields.disabled = true;
    status.textContent = guestCopy.withdrawingReply;
    const result = await client.withdrawPartyReply(eventId, cred);
    if (result.ok) fill(null);
    finish(result, copy.withdrawn);
  });

  fill(party.reply);
  if (closed) lockClosed();
  if (!party.reply) status.textContent = copy.noReply;
  return form;
}
