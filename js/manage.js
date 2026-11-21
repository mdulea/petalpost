// Entry module of manage.html, the host's page for one published event. The management link
// manage.html#<id>.<secret> is the only credential; the page shows the invitation, the reply totals and list,
// and the invitation link, and deletes the event on request.
import './icons.js';
import { getTemplate, renderInvite } from './templates.js';
import { mountInvites } from './mount.js';
import { eventLink, makeInviteData } from './invite.js';
import { createClient, readCredential } from './rsvp.js';

const client = createClient();
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

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

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
  const template = getTemplate(t);
  const data = makeInviteData(template, d);
  const heading = data.title || 'Your invitation';
  document.getElementById('manageHeading').textContent = heading;
  document.title = `${heading} | Petalpost`;
  content.hidden = false;
  mountInvites(document.getElementById('managePreview'), renderInvite(template, data));
  const total = (n, one, many) => item('total', ['strong', String(n)], ['span', n === 1 ? one : many]);
  document
    .getElementById('totals')
    .replaceChildren(
      total(totals.responses, 'reply', 'replies'),
      total(totals.yes, 'yes', 'yes'),
      total(totals.no, 'no', 'no'),
      total(totals.attending, 'person attending', 'people attending'),
    );
  const when = (iso) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  document
    .getElementById('responseList')
    .replaceChildren(
      ...responses.map((r) =>
        item(
          'reply',
          ['strong', r.name],
          ['span', r.attending ? `Yes, ${count(r.partySize, 'person', 'people')}` : 'No'],
          ['span', `${r.updatedAt === r.createdAt ? 'Replied' : 'Changed'} ${when(r.updatedAt)}`],
        ),
      ),
    );
  document.getElementById('noReplies').hidden = responses.length > 0;
  eventLinkInput.value = eventLink(location.origin, cred.id);
}

async function load() {
  statusEl.textContent = 'Loading the replies.';
  const result = await client.loadResponses(cred);
  if (result.ok) {
    showEvent(result.data);
    statusEl.textContent = '';
  } else if (result.status === 404) {
    showOnly('This invitation does not exist', result.message);
  } else if (content.hidden) {
    showOnly('The invitation could not be loaded', result.message);
  } else {
    statusEl.textContent = result.message;
  }
}

document.getElementById('refresh').addEventListener('click', load);

document.getElementById('copyEventLink').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(eventLinkInput.value);
    statusEl.textContent = 'Invitation link copied. Paste it into a message to your guests.';
  } catch {
    window.prompt('Copy this link:', eventLinkInput.value);
  }
});

document.getElementById('deleteEvent').addEventListener('click', async (e) => {
  if (!window.confirm('Delete this invitation and all its replies? This cannot be undone.')) return;
  const button = /** @type {HTMLButtonElement} */ (e.currentTarget);
  button.disabled = true;
  const result = await client.deleteEvent(cred);
  button.disabled = false;
  if (result.ok) showOnly('Invitation deleted', 'The invitation and all its replies are deleted from Petalpost.');
  else statusEl.textContent = result.message;
});

if (cred) load();
else
  showOnly(
    'This management link is incomplete',
    'This management link is incomplete. Open the whole link from where you saved it.',
  );
