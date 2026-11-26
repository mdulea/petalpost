// Entry module of manage.html and ro/manage.html, the tracker of one published event. The credential is the
// management link manage.html#<id>.<secret>, or after a passkey sign-in manage.html#t=<id>.<token> with an access
// token. The page loads the event with its replies, shows the invitation, and hands the rest to the sections in
// tracker/sections.js, which show only in the modes they list.
import './icons.js';
import { UI, localeOf, normalizeLang } from './i18n.js';
import { getTemplate, renderInvite } from './templates.js';
import { mountInvites } from './mount.js';
import { makeInviteData, modeOf } from './invite.js';
import { createClient, readCredential } from './rsvp.js';
import { SECTIONS } from './tracker/sections.js';

const lang = normalizeLang(document.documentElement.lang);
const locale = lang === 'ro' ? localeOf('ro') : undefined;
const copy = UI[lang].manage;

const client = createClient(fetch, { lang });
const signedIn = readCredential(location.hash, 't=');
const cred = readCredential(location.hash, '') ?? signedIn;
const content = document.getElementById('manageContent');
const statusEl = document.getElementById('manageStatus');

// A heading and message for a page that cannot show the event, such as after a failed load or a deletion.
function showOnly(heading, message) {
  document.getElementById('manageHeading').textContent = heading;
  document.title = `${heading} | Petalpost`;
  statusEl.textContent = message;
  content.hidden = true;
}

const setStatus = (text) => {
  statusEl.textContent = text;
};

const page = { lang, locale, copy, client, cred, signedIn: Boolean(signedIn), setStatus, showOnly, load };

function showEvent(data) {
  const template = getTemplate(data.t, lang);
  const invite = makeInviteData(template, data.d, lang);
  const heading = invite.title || copy.defaultHeading;
  document.getElementById('manageHeading').textContent = heading;
  document.title = `${heading} | Petalpost`;
  content.hidden = false;
  mountInvites(document.getElementById('managePreview'), renderInvite(template, invite, { locale }));
  const view = { ...data, invite, mode: modeOf(data.d) };
  for (const section of SECTIONS) {
    const el = document.getElementById(section.id);
    el.hidden = !section.modes.includes(view.mode);
    if (!el.hidden) section.show?.(view, page);
  }
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

SECTIONS.forEach((section) => section.init?.(page));

if (cred) load();
else showOnly(copy.incompleteHeading, copy.incompleteMessage);
