import './icons.js';
import './language-banner.js';
import { UI, categoryLabel, localeOf, normalizeLang } from './i18n.js';
import {
  BANNER_TEMPLATE,
  categoriesFor,
  formatDate,
  getTemplate,
  heroTemplatesFor,
  renderInvite,
  templatesFor,
} from './templates.js';
import { mountInvites } from './mount.js';
import { editorUrl, endInvitation, forgetInvitation, makeInviteData, storedInvitations } from './invite.js';
import { animate, stopMotion } from './motion.js';
import { findInvitation, passkeysSupported } from './passkey.js';
import { createClient, manageLink, signedInLink } from './rsvp.js';

const lang = normalizeLang(document.documentElement.lang);
const locale = lang === 'ro' ? localeOf('ro') : undefined;
const copy = UI[lang].landing;
const catalog = templatesFor(lang);
const categories = categoriesFor(lang);

// Hero fan.
mountInvites(
  document.getElementById('heroFan'),
  heroTemplatesFor(lang)
    .map((id) => {
      const t = getTemplate(id, lang);
      return renderInvite(t, makeInviteData(t, undefined, lang), {
        href: editorUrl(id, lang),
        label: copy.useTemplate(t.name),
        locale,
      });
    })
    .join(''),
);

// Today's pick rotates daily so returning visitors see a different template.
const dayIndex = Math.floor(Date.now() / 86400000) % catalog.length;
const pick = catalog[dayIndex];
const pickLink = /** @type {HTMLAnchorElement} */ (document.getElementById('todaysPick'));
pickLink.href = editorUrl(pick.id, lang);
mountInvites(
  pickLink,
  `${renderInvite(pick, makeInviteData(pick, undefined, lang), { decorative: true, locale })}<div><strong>${pick.name}</strong><span>${pick.tagline}</span></div>`,
);

const banner = getTemplate(BANNER_TEMPLATE, lang);
mountInvites(
  document.getElementById('bannerArt'),
  renderInvite(banner, makeInviteData(banner, undefined, lang), { locale }),
);

// My invitations lists the management pages this browser opened, and stays hidden while it is empty or storage is
// blocked. Each listed invitation that has not ended is loaded once, and a 404 or 410 marks it as ended. The load
// sends only the invitation id, as the invitation link does.
let storage = null;
try {
  storage = localStorage;
} catch {
  storage = null;
}
const invitationsSection = document.getElementById('invitations');
const invitationList = document.getElementById('invitationList');

// Titles come from published invitations, so every value enters the page as textContent.
function invitationItem({ id, secret, lang: pageLang, title, date, ended }) {
  const name = title || copy.untitled;
  const li = document.createElement('li');
  li.className = 'hosted';
  const heading = document.createElement(ended ? 'strong' : 'a');
  heading.textContent = name;
  if (!ended) /** @type {HTMLAnchorElement} */ (heading).href = manageLink('', id, secret, pageLang);
  const details = document.createElement('span');
  details.textContent = date ? formatDate(date, localeOf(lang)) : '';
  li.append(heading, details);
  if (ended) {
    const status = document.createElement('span');
    status.className = 'hosted-ended';
    status.textContent = copy.ended;
    li.append(status);
  }
  const remove = document.createElement('button');
  remove.className = 'btn btn-ghost btn-small';
  remove.type = 'button';
  remove.textContent = copy.remove;
  remove.setAttribute('aria-label', copy.removeLabel(name));
  remove.addEventListener('click', () => {
    forgetInvitation(storage, id);
    showInvitations();
  });
  li.append(remove);
  return li;
}

function showInvitations() {
  const list = storedInvitations(storage);
  invitationsSection.hidden = list.length === 0;
  invitationList.replaceChildren(...list.map(invitationItem));
  return list;
}

const client = createClient(fetch, { lang });
for (const { id } of showInvitations().filter((e) => !e.ended)) {
  client.loadEvent(id).then((result) => {
    if (result.status !== 404 && result.status !== 410) return;
    endInvitation(storage, id);
    showInvitations();
  });
}

// The gallery cards and occasion links are static HTML from scripts/pages.js, so crawlers read them without this
// script. It adds the occasion filters, which only work with JavaScript.
const gallery = document.getElementById('gallery');
const filters = document.getElementById('filters');
filters.innerHTML = ['All', ...categories]
  .map(
    (c, i) =>
      `<button class="filter" type="button" aria-pressed="${i === 0}" data-filter="${c}">${c === 'All' ? copy.all : categoryLabel(c, lang)}</button>`,
  )
  .join('');

const cards = /** @type {HTMLElement[]} */ ([...gallery.querySelectorAll('.card')]);
let filterClicks = 0;

// The shown cards fade out over 150ms, then the chosen category's cards fade in and rise 8px over 200ms. A later
// filter click cancels both steps, so the gallery always ends on the last category chosen.
async function applyFilter(category) {
  const click = (filterClicks += 1);
  filters
    .querySelectorAll('.filter')
    .forEach((/** @type {HTMLElement} */ b) => b.setAttribute('aria-pressed', String(b.dataset.filter === category)));
  const outgoing = cards.filter((card) => !card.hidden);
  // The outgoing cards keep opacity 0 after the fade until they are hidden or fade back in.
  await animate(outgoing, [{ opacity: 1 }, { opacity: 0 }], { duration: 150, easing: 'ease-in', fill: 'forwards' });
  if (click !== filterClicks) return;
  for (const card of cards) card.hidden = category !== 'All' && card.dataset.category !== category;
  stopMotion(outgoing);
  animate(
    cards.filter((card) => !card.hidden),
    [
      { opacity: 0, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'none' },
    ],
    { duration: 200, easing: 'ease-out' },
  );
}

filters.addEventListener('click', (e) => {
  const button = /** @type {HTMLElement} */ (/** @type {Element} */ (e.target).closest('.filter'));
  if (button) applyFilter(button.dataset.filter);
});

// Below 640px, css/styles.css shows the Create invite bar while it has data-shown, which it gets while neither the
// hero button nor the footer is on screen. The browser scrolls a focused control into view only when it is off
// screen, so a control under the bar stays hidden; this scrolls a keyboard-focused control above the bar after the
// browser's own scroll, and again when the bar appears.
const stickyCta = document.getElementById('stickyCta');
const onScreen = new Map();
const barObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) onScreen.set(entry.target, entry.isIntersecting);
  const shown = ![...onScreen.values()].some(Boolean);
  stickyCta.toggleAttribute('data-shown', shown);
  if (shown) keepFocusAboveBar();
});
barObserver.observe(document.querySelector('.hero .btn-primary'));
barObserver.observe(document.querySelector('.site-footer'));

function keepFocusAboveBar() {
  const focused = document.activeElement;
  if (!stickyCta.hasAttribute('data-shown') || !stickyCta.offsetHeight) return;
  if (!focused?.matches(':focus-visible') || stickyCta.contains(focused)) return;
  // The bar may still be sliding in, so its top comes from its height, not its current box.
  const top = innerHeight - stickyCta.offsetHeight;
  const rect = focused.getBoundingClientRect();
  if (rect.bottom > top && rect.top < innerHeight) scrollBy({ top: rect.bottom - top + 16, behavior: 'instant' });
}
document.addEventListener('focusin', () => requestAnimationFrame(keepFocusAboveBar));

// "Find my invitations" signs in with a passkey of this site and opens that invitation's management page.
const findButton = /** @type {HTMLButtonElement} */ (document.getElementById('findInvitations'));
findButton.hidden = !passkeysSupported(globalThis);
findButton.addEventListener('click', async () => {
  findButton.disabled = true;
  const result = await findInvitation(client, navigator.credentials, lang);
  findButton.disabled = false;
  document.getElementById('findStatus').textContent = result.message;
  if (result.ok) location.assign(signedInLink(location.origin, result.data.eventId, result.data.token, lang));
});
