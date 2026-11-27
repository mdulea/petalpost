// Entry module of manage.html and ro/manage.html, the tracker of one published event. The credential is the
// management link manage.html#<id>.<secret>, or after a passkey sign-in manage.html#t=<id>.<token> with an access
// token. The coordinator gates section initialization behind a valid credential, owns one serialized action runner,
// imports the HMAC signing key once per load to attach derived party personal links to view.parties before rendering
// sections, and stops all tracker work on any 410 ended response.
import './icons.js';
import { createClient } from './api-client.js';
import { UI, localeOf, normalizeLang } from './i18n.js';
import { derivePartyLinks, endInvitation, makeInviteData, modeOf, rememberInvitation } from './invite.js';
import { mountInvites } from './mount.js';
import { importPartySigningKey, readCredential } from './rsvp.js';
import { getTemplate, renderInvite } from './templates.js';
import { createTrackerCoordinator } from './tracker/coordinator.js';
import { SECTIONS } from './tracker/sections.js';

const lang = normalizeLang(document.documentElement.lang);
const locale = lang === 'ro' ? localeOf('ro') : undefined;
const copy = UI[lang].manage;

const signedIn = readCredential(location.hash, 't=');
const cred = readCredential(location.hash, '') ?? signedIn;
const content = document.getElementById('manageContent');
const statusEl = document.getElementById('manageStatus');
let latestLoad = 0;
// Reading localStorage throws when the browser blocks storage; null storage then keeps nothing.
let storage = null;
try {
  storage = localStorage;
} catch {
  storage = null;
}

// A heading and message for a page that cannot show the event, such as after a failed load or a deletion.
function showOnly(heading, message) {
  document.getElementById('manageHeading').textContent = heading;
  document.title = `${heading} | Petalpost`;
  statusEl.textContent = message;
  content.hidden = true;
}

const coordinator = createTrackerCoordinator({
  load,
  onEnded() {
    if (cred) endInvitation(storage, cred.id);
    showOnly(copy.endedHeading, `${copy.endedHeading}.`);
  },
});

// A 410 from any tracker request ends the view through the client lifecycle hook.
const client = createClient(fetch, {
  lang,
  onEnded: () => coordinator.markEnded(),
});

const setStatus = (text) => {
  if (!coordinator.isEnded()) statusEl.textContent = text;
};

const formatTime = (iso) =>
  new Date(iso).toLocaleString(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    ...(lang === 'ro' ? { hour12: false } : {}),
  });

const page = {
  lang,
  locale,
  copy,
  client,
  cred,
  signedIn: Boolean(signedIn),
  storage,
  formatTime,
  setStatus,
  showOnly,
  load,
  runAction: coordinator.run,
  isEnded: coordinator.isEnded,
};

async function attachPartyLinks(parties) {
  const signingKey = await importPartySigningKey(cred.secret);
  return Promise.all(
    parties.map(async (party) =>
      party.revoked
        ? { ...party, links: null }
        : { ...party, links: await derivePartyLinks(location.origin, cred.id, signingKey, party) },
    ),
  );
}

async function showEvent(data, request) {
  const template = getTemplate(data.t, lang);
  const invite = makeInviteData(template, data.d, lang);
  const mode = modeOf(data.d);
  const parties =
    mode === 'guestList' && !signedIn && data.parties ? await attachPartyLinks(data.parties) : data.parties;
  if (request !== latestLoad || coordinator.isEnded()) return;
  const heading = invite.title || copy.defaultHeading;
  document.getElementById('manageHeading').textContent = heading;
  document.title = `${heading} | Petalpost`;
  content.hidden = false;
  mountInvites(document.getElementById('managePreview'), renderInvite(template, invite, { locale }));
  // An access token is not the management link, so a passkey sign-in leaves My invitations unchanged.
  if (!signedIn) {
    const { title = '', date = '' } = data.d;
    rememberInvitation(storage, { id: cred.id, secret: cred.secret, lang, title, date });
  }
  const view = { ...data, parties, invite, mode, loadId: request };
  await Promise.all(
    SECTIONS.map((section) => {
      const el = document.getElementById(section.id);
      el.hidden = !section.modes.includes(view.mode);
      if (!el.hidden) return section.show?.(view, page);
    }),
  );
}

async function load() {
  if (coordinator.isEnded()) return;
  const request = ++latestLoad;
  statusEl.textContent = copy.loading;
  const result = await client.loadResponses(cred);
  if (coordinator.isEnded() || request !== latestLoad) return;
  if (result.ok) {
    await showEvent(result.data, request);
    if (request === latestLoad && !coordinator.isEnded()) statusEl.textContent = '';
  } else if (result.status === 404) {
    endInvitation(storage, cred.id);
    showOnly(copy.missingHeading, result.message);
  } else if (content.hidden) {
    showOnly(copy.loadFailedHeading, result.message);
  } else {
    statusEl.textContent = result.message;
  }
}

// Pasting a full management link after signing in can change only the fragment of this page.
window.addEventListener('hashchange', () => location.reload());

if (cred) {
  SECTIONS.forEach((section) => section.init?.(page));
  load();
} else {
  showOnly(copy.incompleteHeading, copy.incompleteMessage);
}
