// Entry module of manage.html and ro/manage.html, the host's page for one published event. The management link
// manage.html#<id>.<secret> is the only credential; the page shows the invitation, the reply totals and list,
// and the invitation link, and deletes the event on request.
import './icons.js';
import { UI, localeOf, normalizeLang } from './i18n.js';
import { getTemplate, renderInvite } from './templates.js';
import { mountInvites } from './mount.js';
import { eventLink, makeInviteData } from './invite.js';
import { createClient, readCredential } from './rsvp.js';

const lang = normalizeLang(document.documentElement.lang);
const locale = lang === 'ro' ? localeOf('ro') : undefined;
const copy = UI[lang].manage;

const client = createClient(fetch, { lang });
const cred = readCredential(location.hash, '');
const content = document.getElementById('manageContent');
const statusEl = document.getElementById('manageStatus');
const eventLinkInput = /** @type {HTMLInputElement} */ (document.getElementById('eventLink'));

// A heading and message for a page that cannot show the event, such as after a failed load or a deletion.
function showOnly(heading, message) {
  document.getElementById('manageHeading').textContent = heading;
  document.title = `${heading} | Petalpost`;
  statusEl.textContent = message;
  content.hidden = true;
}

// Guest names are untrusted text, so every value enters the page as textContent.
function item(className, ...parts) {
  const li = document.createElement('li');
  li.className = className;
  for (const [tag, text] of parts) {
    const el = document.createElement(tag);
    el.textContent = text;
    li.append(el);
  }
  return li;
}

function showEvent({ t, d, responses, totals }) {
  const template = getTemplate(t, lang);
  const data = makeInviteData(template, d, lang);
  const heading = data.title || copy.defaultHeading;
  document.getElementById('manageHeading').textContent = heading;
  document.title = `${heading} | Petalpost`;
  content.hidden = false;
  mountInvites(document.getElementById('managePreview'), renderInvite(template, data, { locale }));
  const total = (n, one, many) => item('total', ['strong', String(n)], ['span', n === 1 ? one : many]);
  document
    .getElementById('totals')
    .replaceChildren(
      total(totals.responses, copy.replyOne, copy.replyMany),
      total(totals.yes, copy.yesOne, copy.yesMany),
      total(totals.no, copy.noOne, copy.noMany),
      total(totals.attending, copy.attendingOne, copy.attendingMany),
    );
  const when = (iso) =>
    new Date(iso).toLocaleString(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      ...(lang === 'ro' ? { hour12: false } : {}),
    });
  document
    .getElementById('responseList')
    .replaceChildren(
      ...responses.map((r) =>
        item(
          'reply',
          ['strong', r.name],
          ['span', r.attending ? copy.yesCount(r.partySize) : copy.no],
          ['span', `${r.updatedAt === r.createdAt ? copy.replied : copy.changed} ${when(r.updatedAt)}`],
        ),
      ),
    );
  document.getElementById('noReplies').hidden = responses.length > 0;
  eventLinkInput.value = eventLink(location.origin, cred.id, lang);
}

async function load() {
  statusEl.textContent = copy.loading;
  const result = await client.loadResponses(cred);
  if (result.ok) {
    showEvent(result.data);
    statusEl.textContent = '';
  } else if (result.status === 404) {
    showOnly(copy.missingHeading, result.message);
  } else if (content.hidden) {
    showOnly(copy.loadFailedHeading, result.message);
  } else {
    statusEl.textContent = result.message;
  }
}

document.getElementById('refresh').addEventListener('click', load);

document.getElementById('copyEventLink').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(eventLinkInput.value);
    statusEl.textContent = copy.eventLinkCopied;
  } catch {
    window.prompt(copy.copyPrompt, eventLinkInput.value);
  }
});

document.getElementById('deleteEvent').addEventListener('click', async (e) => {
  if (!window.confirm(copy.deleteConfirm)) return;
  const button = /** @type {HTMLButtonElement} */ (e.currentTarget);
  button.disabled = true;
  const result = await client.deleteEvent(cred);
  button.disabled = false;
  if (result.ok) showOnly(copy.deletedHeading, copy.deletedMessage);
  else statusEl.textContent = result.message;
});

if (cred) load();
else showOnly(copy.incompleteHeading, copy.incompleteMessage);
