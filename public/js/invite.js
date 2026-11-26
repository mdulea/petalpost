// Invite records, share links and the calendar file. No DOM access, so tests/check-invite.js runs it in Node.

import { eventFields } from './countdown.js';
import { UI, localeOf, normalizeLang } from './i18n.js';
import { ID_PATTERN, SECRET_PATTERN, newId, partyLinkSecret, personalLink, viewLink, viewLinkSecret } from './rsvp.js';
import { ACCENTS, formatWhen, getTemplate, localizeTemplate, PHOTO_URL, TEMPLATES } from './templates.js';

// Text fields and their length limits; editor.js copies each limit to its input. Date and time have none.
export const FIELD_LIMITS = {
  eyebrow: 60,
  title: 48,
  hosts: 60,
  date: null,
  time: null,
  venue: 60,
  address: 90,
  message: 110,
  rsvp: 40,
};
export const FIELDS = Object.keys(FIELD_LIMITS);
export const UPDATE_NOTICE_LIMIT = 500;
// The characters left in a field whose text has the length, once it passes 80% of the limit, or null at or below
// 80%. Text past the limit leaves 0.
export const charsLeft = (length, limit) => (length > limit * 0.8 ? Math.max(0, limit - length) : null);
// The modes of a published invitation. In the open mode any guest with the invitation link replies. In the guest-list
// mode the invitation link shows the invitation without a reply form. The open mode is the default.
export const MODES = ['open', 'guestList'];
// The mode of untrusted invitation data. A d without a mode, such as one stored before invitations had modes, is open.
export const modeOf = (d) => (MODES.includes(d?.mode) ? d.mode : 'open');
// Every name the editor form writes, and every key of a record.
export const EDITABLE = [...FIELDS, 'photoY', 'accent', 'mode'];
// Date and time take the editor input formats, YYYY-MM-DD for a real day and HH:MM, or empty for a cleared input.
const FIELD_FORMATS = {
  date: (v) => v === '' || (/^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00Z`).toJSON()?.startsWith(v)),
  time: (v) => /^(([01]\d|2[0-3]):[0-5]\d)?$/.test(v),
};
// A string within its limit and format, for a field of the invitation or of a sub-event.
const fits = (v, limit, format) => typeof v === 'string' && (!limit || v.length <= limit) && (!format || format(v));

// A sub-event is one part of the event, such as the civil ceremony, with its own name, date, time and venue. Date
// and time take the formats of the invitation's date and time. A record without sub-events has no subEvents key, so
// it keeps the shape of a record from before sub-events existed.
export const SUB_EVENT_LIMITS = { name: 40, date: null, time: null, venue: 60 };
export const SUB_EVENT_FIELDS = Object.keys(SUB_EVENT_LIMITS);
export const MAX_SUB_EVENTS = 8;
// A sub-event id keys the reply answers to that sub-event, so it stays with the sub-event through edits and moves.
// The editor gives a new sub-event a random id from newId. A sub-event stored before sub-events had ids has none,
// and its id is its position in the list, counted from 1. A random id is 22 characters, so it never equals a position.
export const SUB_EVENT_ID = /^[A-Za-z0-9_-]{1,22}$/;
const idOf = (subEvent, index) => subEvent.id ?? String(index + 1);
// The ids of the sub-events of d, a published d as readPublished returns it or as the database stores it, in order.
export const subEventIds = (d) => (d?.subEvents ?? []).map(idOf);
// The {id, name} of each sub-event of d for the reply answers, where a sub-event without a name is part n.
export const subEventLabels = (d, lang = 'en') =>
  (d?.subEvents ?? []).map((e, i) => ({
    id: idOf(e, i),
    name: e.name || UI[normalizeLang(lang)].subEventReplies.untitled(i + 1),
  }));

// A menu option is one meal the host offers, such as standard, vegetarian or child. A reply gives a count for each
// option, keyed by its id. The editor gives a new option a random id from newId, and the id stays with the option
// through edits. A record without menu options has no menu key, so it keeps the shape of a record from before menus.
export const MENU_OPTION_LIMIT = 40;
export const MAX_MENU_OPTIONS = 6;
// The ids of the menu options of d, a published d as readPublished returns it or as the database stores it, in order.
export const menuOptionIds = (d) => (d?.menu ?? []).map((option) => option.id);
// The {id, name} of each menu option of d for the meal counts, where an option without a name is option n.
export const menuLabels = (d, lang = 'en') =>
  (d?.menu ?? []).map((option, i) => ({
    id: option.id,
    name: option.name || UI[normalizeLang(lang)].menu.untitled(i + 1),
  }));

// Untrusted source at index becomes a sub-event: a valid id kept or else its position, each valid field cut to its
// limit, and an empty string for any other field.
function makeSubEvent(source, index) {
  const s = source && typeof source === 'object' ? source : {};
  return {
    id: typeof s.id === 'string' && SUB_EVENT_ID.test(s.id) ? s.id : String(index + 1),
    ...Object.fromEntries(
      SUB_EVENT_FIELDS.map((f) => [
        f,
        fits(s[f], null, FIELD_FORMATS[f]) ? s[f].slice(0, SUB_EVENT_LIMITS[f] ?? undefined) : '',
      ]),
    ),
  };
}

// The only constructor for invite data: template sample text, then valid fields from source, cut to their limits.
export function makeInviteData(template, source, lang = 'en') {
  const s = { ...source };
  const d = { ...localizeTemplate(template, lang).defaults };
  FIELDS.forEach((f) => {
    if (typeof s[f] !== 'string' || (FIELD_FORMATS[f] && !FIELD_FORMATS[f](s[f]))) return;
    d[f] = FIELD_LIMITS[f] ? s[f].slice(0, FIELD_LIMITS[f]) : s[f];
  });
  // The photo position is a percentage within the editor slider's 0 to 100 range.
  d.photoY = s.photoY != null && Number.isFinite(Number(s.photoY)) ? Math.min(100, Math.max(0, Number(s.photoY))) : 50;
  d.accent = ACCENTS.some((a) => a.hex === s.accent) ? s.accent : null;
  d.mode = modeOf(s);
  const subEvents = Array.isArray(s.subEvents) ? s.subEvents.slice(0, MAX_SUB_EVENTS).map(makeSubEvent) : [];
  // A repeated id gets a new one, so each id names one sub-event.
  const seen = new Set();
  for (const e of subEvents) {
    if (seen.has(e.id)) e.id = newId();
    seen.add(e.id);
  }
  if (subEvents.length) d.subEvents = subEvents;
  // A menu option keeps a valid id that no earlier option has, and else gets a new one. Its name is cut to its limit.
  const menu = Array.isArray(s.menu) ? s.menu.slice(0, MAX_MENU_OPTIONS) : [];
  const optionIds = new Set();
  d.menu = menu.map((source) => {
    const o = source && typeof source === 'object' ? source : {};
    const id = typeof o.id === 'string' && SUB_EVENT_ID.test(o.id) && !optionIds.has(o.id) ? o.id : newId();
    optionIds.add(id);
    return { id, name: typeof o.name === 'string' ? o.name.slice(0, MENU_OPTION_LIMIT) : '' };
  });
  if (!d.menu.length) delete d.menu;
  return d;
}

// Editor input for one field, through the same rules as makeInviteData. Returns false for an unknown name.
export function updateInvite(state, name, value, lang = 'en') {
  if (!EDITABLE.includes(name)) return false;
  state.d = makeInviteData(getTemplate(state.t, lang), { ...state.d, [name]: value }, lang);
  return true;
}

// The editor actions on the sub-events, each through makeInviteData. index counts from 0. Each returns false and
// changes nothing for an index or name outside the list, a move past either end, or an add at MAX_SUB_EVENTS.
const subEventsOf = (state) => state.d.subEvents ?? [];
function setSubEvents(state, subEvents, lang) {
  state.d = makeInviteData(getTemplate(state.t, lang), { ...state.d, subEvents }, lang);
}

export function addSubEvent(state, lang = 'en') {
  const list = subEventsOf(state);
  if (list.length >= MAX_SUB_EVENTS) return false;
  setSubEvents(state, [...list, { id: newId() }], lang);
  return true;
}

export function updateSubEvent(state, index, name, value, lang = 'en') {
  const list = subEventsOf(state);
  if (!list[index] || !SUB_EVENT_FIELDS.includes(name)) return false;
  setSubEvents(state, list.with(index, { ...list[index], [name]: value }), lang);
  return true;
}

// offset -1 moves the sub-event one place earlier, and 1 one place later.
export function moveSubEvent(state, index, offset, lang = 'en') {
  const list = subEventsOf(state);
  const to = index + offset;
  if (!list[index] || !list[to]) return false;
  setSubEvents(state, list.with(index, list[to]).with(to, list[index]), lang);
  return true;
}

export function removeSubEvent(state, index, lang = 'en') {
  const list = subEventsOf(state);
  if (!list[index]) return false;
  setSubEvents(
    state,
    list.filter((_, i) => i !== index),
    lang,
  );
  return true;
}

// The editor actions on the menu options, each through makeInviteData. index counts from 0. Each returns false and
// changes nothing for an index outside the list or an add at MAX_MENU_OPTIONS.
const menuOf = (state) => state.d.menu ?? [];
function setMenu(state, menu, lang) {
  state.d = makeInviteData(getTemplate(state.t, lang), { ...state.d, menu }, lang);
}

export function addMenuOption(state, lang = 'en') {
  const list = menuOf(state);
  if (list.length >= MAX_MENU_OPTIONS) return false;
  setMenu(state, [...list, { id: newId(), name: '' }], lang);
  return true;
}

export function renameMenuOption(state, index, name, lang = 'en') {
  const list = menuOf(state);
  if (!list[index]) return false;
  setMenu(state, list.with(index, { ...list[index], name }), lang);
  return true;
}

export function removeMenuOption(state, index, lang = 'en') {
  const list = menuOf(state);
  if (!list[index]) return false;
  setMenu(
    state,
    list.filter((_, i) => i !== index),
    lang,
  );
  return true;
}

// Text goes back to the template sample, the accent to the template default; the photo position and mode stay.
// Sub-events and menu options are text, so a reset removes them.
export function resetInvite(state, lang = 'en') {
  state.d = makeInviteData(getTemplate(state.t, lang), { photoY: state.d.photoY, mode: state.d.mode }, lang);
}

// Fields still holding the old template's sample text take the new template's text; edited and cleared fields stay.
export function switchTemplate(state, id, lang = 'en') {
  const from = getTemplate(state.t, lang);
  const to = getTemplate(id, lang);
  const kept = { ...state.d };
  FIELDS.forEach((f) => {
    if (kept[f] === from.defaults[f]) delete kept[f];
  });
  state.d = makeInviteData(to, kept, lang);
  state.t = to.id;
}

// Untrusted {t, d} from a share link or the stored draft becomes a record, or null.
function restoreInvite(value, lang = 'en') {
  if (!value || typeof value !== 'object') return null;
  const template = getTemplate(value.t, lang);
  return { t: template.id, d: makeInviteData(template, value.d, lang) };
}

// Untrusted {t, d} for a published event becomes {t, d}, or null. Unlike makeInviteData it repairs nothing:
// t names a template, d has exactly the text fields, the accent and an optional mode, each text within its limit and
// format, the accent is null or one of ACCENTS, and the mode is one of MODES. A d without a mode, which a page loaded
// before invitations had modes sends, gets the open mode. d may also hold subEvents: up to MAX_SUB_EVENTS objects
// with exactly the sub-event fields, each within its limit and format, and an optional SUB_EVENT_ID id. A sub-event
// without an id, which a page loaded before sub-events had ids sends, gets its position as its id, and two sub-events
// with one id are refused. An empty list leaves the key out of the result, and a page loaded before sub-events
// existed sends none. d may also hold menu: up to MAX_MENU_OPTIONS objects of exactly a SUB_EVENT_ID id, which no
// other option has, and a name of at most MENU_OPTION_LIMIT characters. An empty menu leaves the key out of the
// result, and a page loaded before menus existed sends none. The photo position stays with the owner's draft, so d
// has no photoY.
export function readPublished(value) {
  if (!value || typeof value !== 'object' || !TEMPLATES.some((t) => t.id === value.t)) return null;
  const s = value.d;
  if (!s || typeof s !== 'object') return null;
  const hasMode = Object.hasOwn(s, 'mode');
  const keys =
    FIELDS.length +
    1 +
    (hasMode ? 1 : 0) +
    (Object.hasOwn(s, 'subEvents') ? 1 : 0) +
    (Object.hasOwn(s, 'menu') ? 1 : 0);
  if (Object.keys(s).length !== keys || (hasMode && !MODES.includes(s.mode))) return null;
  const valid = FIELDS.every((f) => fits(s[f], FIELD_LIMITS[f], FIELD_FORMATS[f]));
  if (!valid || !(s.accent === null || ACCENTS.some((a) => a.hex === s.accent))) return null;
  const subEvents = s.subEvents ?? [];
  const validSubEvent = (e) =>
    e &&
    typeof e === 'object' &&
    Object.keys(e).length === SUB_EVENT_FIELDS.length + (Object.hasOwn(e, 'id') ? 1 : 0) &&
    (!Object.hasOwn(e, 'id') || (typeof e.id === 'string' && SUB_EVENT_ID.test(e.id))) &&
    SUB_EVENT_FIELDS.every((f) => fits(e[f], SUB_EVENT_LIMITS[f], FIELD_FORMATS[f]));
  if (!Array.isArray(subEvents) || subEvents.length > MAX_SUB_EVENTS || !subEvents.every(validSubEvent)) return null;
  const ids = subEvents.map(idOf);
  if (new Set(ids).size !== ids.length) return null;
  const menu = s.menu ?? [];
  const validOption = (o) =>
    o &&
    typeof o === 'object' &&
    Object.keys(o).length === 2 &&
    typeof o.id === 'string' &&
    SUB_EVENT_ID.test(o.id) &&
    fits(o.name, MENU_OPTION_LIMIT);
  if (!Array.isArray(menu) || menu.length > MAX_MENU_OPTIONS || !menu.every(validOption)) return null;
  if (new Set(menu.map((o) => o.id)).size !== menu.length) return null;
  const d = {};
  [...FIELDS, 'accent'].forEach((f) => {
    d[f] = s[f];
  });
  d.mode = modeOf(s);
  if (subEvents.length) {
    d.subEvents = subEvents.map((e, i) => ({
      id: ids[i],
      ...Object.fromEntries(SUB_EVENT_FIELDS.map((f) => [f, e[f]])),
    }));
  }
  if (menu.length) d.menu = menu.map(({ id, name }) => ({ id, name }));
  return { t: value.t, d };
}

// The invitation link of a published event opens the guest view at /e/<id> (or /ro/e/<id>), serving dynamic link metadata.
export const eventLink = (origin, id, lang = 'en') => `${origin}${normalizeLang(lang) === 'ro' ? '/ro' : ''}/e/${id}`;

// Builds the party's current links in its language from the management credential. Derives the preview only on demand.
export async function partyInviteLinks(origin, cred, party) {
  const base = eventLink(origin, cred.id, party.lang);
  const secret = await partyLinkSecret(cred.secret, party.id, 'personal', party.linkGeneration);
  return {
    personal: personalLink(base, party.id, secret),
    preview: async () => viewLink(base, party.id, await viewLinkSecret(secret, party.id)),
  };
}

// Link preview and native share metadata built from an invite's title, date, time and venue. details is the date and
// venue line, empty when the invite has neither; description falls back to generic copy then.
// locale fixes date and time formatting on the server so link previews stay consistent across regions.
export function eventPreviewMeta(data, locale = 'en-US') {
  const isRo = typeof locale === 'string' && locale.toLowerCase().startsWith('ro');
  const title = (data.title || '').trim() || (isRo ? 'Ești invitat' : 'You are invited');
  const when = formatWhen(data.date, data.time, locale);
  const where = (data.venue || '').trim() || (data.address || '').trim();
  const details = [when, where].filter(Boolean).join(' · ');
  return {
    title,
    pageTitle: `${title} | Petalpost`,
    details,
    description:
      details ||
      (isRo
        ? 'Ești invitat. Deschide invitația pentru a vedea detaliile și a confirma participarea.'
        : 'You are invited. Open the invitation to see the details and reply.'),
  };
}

// A WhatsApp link that prefills text.
export const whatsappUrl = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;

// A WhatsApp link that opens a message with the invite's title, its date and venue line, and url, each on its own
// line and with empty lines left out. url is the invitation link from eventLink, never the management link.
export function whatsappLink(data, locale, url) {
  const { title, details } = eventPreviewMeta(data, locale);
  return whatsappUrl([title, details, url].filter(Boolean).join('\n'));
}

// The message a host sends a party with its personal link, in the party's language: the party's greeting, the
// invite's title and date and venue line in that language's locale, and the personal link, with empty lines left out.
export function personalMessage(party, data, url) {
  const code = normalizeLang(party.lang);
  const name = typeof party.name === 'string' ? party.name.trim() : '';
  const greeting = name ? UI[code].personal.greeting(name) : '';
  const { title, details } = eventPreviewMeta(data, localeOf(code));
  return [greeting, title, details, url].filter(Boolean).join('\n');
}

// A reminder in the party's language that asks it to reply through its personal link.
export function reminderMessage(party, url) {
  const { greeting, reminder } = UI[normalizeLang(party.lang)].personal;
  return [greeting(party.name), reminder, url].join('\n');
}

// The WhatsApp text for the latest update, with the party's greeting and personal link.
export function updateMessage(party, update, url) {
  const copy = UI[normalizeLang(party.lang)].personal;
  return [copy.greeting(party.name), copy.updateHeading, update, url].join('\n');
}

// The single contact address of the site, for users and authorities. scripts/pages.js puts it in every footer.
export const CONTACT = 'contact@petalpost.ro';

// A mailto link that reports a published invitation under DSA Art. 16(2): the exact address of the content, the
// reason it is illegal, the reporter's name and email address, and a statement of good faith. url is the invitation
// link from eventLink, never the page address, which can carry a guest's private edit secret after the #.
export function reportLink(url, lang = 'en') {
  const copy = UI[normalizeLang(lang)].report;
  return `mailto:${CONTACT}?subject=${encodeURIComponent(copy.subject)}&body=${encodeURIComponent(copy.body(url))}`;
}

// A photo is a JPEG or PNG data URL, or null for none.
const isPhoto = (url) => url === null || PHOTO_URL.test(url);

// Editor URLs: ?t= opens a template for the owner, ?view=1 opens the guest view. openInvite parses both.
export const editorUrl = (id, lang = 'en') =>
  `${normalizeLang(lang) === 'ro' ? '/ro/editor.html' : 'editor.html'}?t=${encodeURIComponent(id)}`;

// Share links open the guest view; the photo position stays with the owner's draft.
export function shareLink(base, record) {
  const { photoY, ...fields } = record.d;
  return `${base}?view=1#d=${encodeState({ t: record.t, d: fields })}`;
}

// The stored draft keeps the whole record, photo position included; openInvite reads it back.
export function draftOf(record) {
  return JSON.stringify({ t: record.t, d: record.d });
}

// The owner's stored event identity {id, secret, version} from its JSON text, or null. version is null until
// the first publish succeeds, so a retry after a lost confirmation reuses the id and secret.
function readPublishedEvent(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const { id, secret, version } = value;
  const validVersion = version === null || (Number.isInteger(version) && version > 0);
  if (!ID_PATTERN.test(id) || !SECRET_PATTERN.test(secret) || !validVersion) return null;
  return { id, secret, version };
}

// Load order: an /e/<id> path always opens the guest view for that published event; otherwise a share link wins and
// carries no photo; otherwise the stored draft or a new invite, switched to the ?t= template. Inputs are the raw
// pathname, search, hash and storage strings; guest is true for /e/<id> or ?view=1.
// sample is true for a client-only sample guest view (?view=1&sample=1 without a #d= hash), which renders the
// requested or default template and ignores any e parameter and stored owner draft, photo or event identity.
// event is the public id of a published event for /e/<id> or a legacy ?view=1&e=<id> link, which the page loads;
// until then the state holds a new invite that the page must not show. publishedEvent is the owner's stored event
// identity, or null; a guest view gets null and never writes it.
// broken is true for a guest view without a readable link, such as one a messaging app cut short. It opens a new
// invite that the page must not show, and never the stored draft or photo, which belong to this browser's owner.
export function openInvite({
  pathname = '',
  search = '',
  hash = '',
  draft = null,
  photo = null,
  publishedEvent = null,
  lang = 'en',
}) {
  const code = normalizeLang(lang);
  const params = new URLSearchParams(search);
  const requested = params.get('t');
  if (pathname.startsWith('/e/') || pathname.startsWith('/ro/e/')) {
    const match = pathname.match(/^(?:\/ro)?\/e\/([^/]+)$/);
    const event = match && ID_PATTERN.test(match[1]) ? match[1] : null;
    return {
      ...restoreInvite({ t: requested }, code),
      photo: null,
      guest: true,
      sample: false,
      broken: !event,
      event,
      publishedEvent: null,
    };
  }
  const guest = params.get('view') === '1';
  const owned = guest ? null : readPublishedEvent(publishedEvent);
  const hasShareHash = hash.startsWith('#d=');
  const shared = hasShareHash ? restoreInvite(decodeState(hash.slice(3)), code) : null;
  if (shared)
    return { ...shared, photo: null, guest, sample: false, broken: false, event: null, publishedEvent: owned };
  if (guest) {
    if (hasShareHash) {
      return {
        ...restoreInvite({ t: requested }, code),
        photo: null,
        guest,
        sample: false,
        broken: true,
        event: null,
        publishedEvent: null,
      };
    }
    if (params.get('sample') === '1') {
      return {
        ...restoreInvite({ t: requested }, code),
        photo: null,
        guest,
        sample: true,
        broken: false,
        event: null,
        publishedEvent: null,
      };
    }
    const event = ID_PATTERN.test(params.get('e') ?? '') ? params.get('e') : null;
    return {
      ...restoreInvite({ t: requested }, code),
      photo: null,
      guest,
      sample: false,
      broken: !event,
      event,
      publishedEvent: null,
    };
  }
  let saved;
  try {
    saved = JSON.parse(draft);
  } catch {
    saved = null;
  }
  const state = {
    ...(restoreInvite(saved, code) || restoreInvite({ t: requested }, code)),
    photo: isPhoto(photo) ? photo : null,
    guest,
    sample: false,
    broken: false,
    event: null,
    publishedEvent: owned,
  };
  if (requested && requested !== state.t) switchTemplate(state, requested, code);
  return state;
}

// Storage keeps the owner's draft, photo and published event identity for a reload. storage has the localStorage
// shape; a blocked or full storage throws, and the reads and writes below treat that as no value or a refused write.
// Romanian drafts stay under a separate namespace so switching locales never loads English sample text as a draft.
const storageKey = (name, lang = 'en') => (normalizeLang(lang) === 'ro' ? `petalpost:ro:${name}` : `petalpost:${name}`);

function readStorage(storage, key) {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage, key, value) {
  try {
    if (value == null) storage.removeItem(key);
    else storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

// The stored draft, photo and event identity strings, as openInvite takes them.
export const storedInvite = (storage, lang = 'en') => ({
  draft: readStorage(storage, storageKey('draft', lang)),
  photo: readStorage(storage, storageKey('photo', lang)),
  publishedEvent: readStorage(storage, storageKey('event', lang)),
});

// The stored event identity alone, or null. A publish reads it again, because another tab may have stored one
// since this page opened.
export const storedPublishedEvent = (storage, lang = 'en') =>
  readPublishedEvent(readStorage(storage, storageKey('event', lang)));

// The guest view never writes: a share link opens on the owner's origin and would overwrite the owner's draft.
export function saveDraft(state, storage, lang = 'en') {
  if (!state.guest) writeStorage(storage, storageKey('draft', lang), draftOf(state));
}

// Writes state.publishedEvent, or removes the stored identity when it is null. The guest view never writes.
// Returns false when storage refused the write.
export function savePublishedEvent(state, storage, lang = 'en') {
  if (state.guest) return false;
  return writeStorage(storage, storageKey('event', lang), state.publishedEvent && JSON.stringify(state.publishedEvent));
}

// My invitations: the management links this browser opened, newest first, at most INVITATIONS_LIMIT of them. One
// key holds both languages, so the English and Romanian home pages show the same list. Each entry is
// {id, secret, lang, title, date, ended}; lang is the management page language and date is YYYY-MM-DD or empty.
// Every change reads the list again before it writes, because another tab may have changed it. A change returns
// false when storage refused it.
const INVITATIONS_KEY = 'petalpost:invitations';
export const INVITATIONS_LIMIT = 50;

const isInvitation = (e) =>
  Boolean(e) &&
  ID_PATTERN.test(e.id) &&
  SECRET_PATTERN.test(e.secret) &&
  (e.lang === 'en' || e.lang === 'ro') &&
  typeof e.title === 'string' &&
  typeof e.date === 'string' &&
  FIELD_FORMATS.date(e.date) &&
  typeof e.ended === 'boolean';

export function storedInvitations(storage) {
  try {
    const list = JSON.parse(readStorage(storage, INVITATIONS_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter(isInvitation) : [];
  } catch {
    return [];
  }
}

const saveInvitations = (storage, list) => writeStorage(storage, INVITATIONS_KEY, JSON.stringify(list));

// Lists the invitation {id, secret, lang, title, date} first, as not ended, in place of its earlier entry.
export function rememberInvitation(storage, { id, secret, lang, title, date }) {
  const entry = { id, secret, lang, title, date, ended: false };
  const rest = storedInvitations(storage).filter((e) => e.id !== id);
  return saveInvitations(storage, [entry, ...rest].slice(0, INVITATIONS_LIMIT));
}

// Marks a deleted or expired invitation as ended. An id that is not listed changes nothing.
export const endInvitation = (storage, id) =>
  saveInvitations(
    storage,
    storedInvitations(storage).map((e) => (e.id === id ? { ...e, ended: true } : e)),
  );

export const forgetInvitation = (storage, id) =>
  saveInvitations(
    storage,
    storedInvitations(storage).filter((e) => e.id !== id),
  );

const photoChanges = new WeakMap();

// The only writer of the photo: a JPEG or PNG data URL, a promise for one, or null to remove it.
// The latest request wins, even when decoding completes out of order; older requests return 'superseded'.
// Returns 'refused' and keeps the current photo for anything else, such as the "data:," export of an empty canvas.
// Returns 'unsaved' when the photo does not fit in storage: it shows now and the stored one is removed. Otherwise 'saved'.
export async function changePhoto(state, source, storage, lang = 'en') {
  const request = {};
  photoChanges.set(state, request);
  let url;
  try {
    url = await source;
  } catch {
    url = undefined;
  }
  if (photoChanges.get(state) !== request) return 'superseded';
  if (!isPhoto(url)) return 'refused';
  state.photo = url;
  const key = storageKey('photo', lang);
  if (state.guest || writeStorage(storage, key, url)) return 'saved';
  writeStorage(storage, key, null);
  return 'unsaved';
}

// Share links store {t, d} as URL-safe base64 JSON in the hash.
function encodeState(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeState(text) {
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))));
  } catch {
    return null;
  }
}

// Guest view: the address as a Google Maps search, or null without an address.
export const mapLink = (data) =>
  data.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(data.address)}` : null;

export const slug = (text) =>
  (text || 'invite')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'invite';

function icsEscape(text) {
  return String(text || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r\n?|\n/g, '\\n')
    .replace(/([,;])/g, '\\$1');
}

// RFC 5545 section 3.1: a line longer than 75 octets continues on the next line after one space.
// Breaks fall between code points, so a multi-byte character stays whole.
function foldIcs(line) {
  let folded = '';
  let size = 0;
  for (const ch of line) {
    const octets = new TextEncoder().encode(ch).length;
    if (size + octets > 75) {
      folded += '\r\n ';
      size = 1;
    }
    folded += ch;
    size += octets;
  }
  return folded;
}

// A calendar app shows an alarm one day and two hours before each entry.
const ALARMS = ['-P1D', '-PT2H'];

// data: a record from makeInviteData. The file has one entry for each sub-event with a date, or one entry for the
// invitation when no sub-event has a date. A sub-event entry joins the invitation title and the sub-event name, and
// takes the invitation's venue and address when it has no venue. Entries last three hours in floating local time and
// carry ALARMS. now sets DTSTAMP. Returns null when no entry has a date.
export function buildIcs(data, now) {
  const place = [data.venue, data.address].filter(Boolean).join(', ');
  // A sub-event entry's UID ends in its place in the list, so two sub-events on one day get different UIDs.
  const subEvents = (data.subEvents ?? []).map((s, i) => ({
    date: s.date,
    time: s.time,
    summary: [data.title, s.name].filter(Boolean).join(': '),
    location: s.venue || place,
    uidEnd: `-${i + 1}`,
  }));
  const invitation = { date: data.date, time: data.time, summary: data.title, location: place, uidEnd: '' };
  const dated = subEvents.filter((e) => e.date);
  const entries = (dated.length ? dated : [invitation]).filter((e) => e.date);
  if (!entries.length) return null;
  const local = (date) =>
    date
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d+Z$/, '');
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const description = icsEscape([data.hosts, data.message, data.rsvp].filter(Boolean).join('\n'));
  const events = entries.flatMap((e) => {
    // The UTC clock holds the floating local time, so no time zone shifts it.
    const start = new Date(Date.UTC(...eventFields(e)));
    const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
    return [
      'BEGIN:VEVENT',
      `UID:${e.date.replace(/-/g, '')}-${slug(data.title)}${e.uidEnd}@petalpost`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${local(start)}`,
      `DTEND:${local(end)}`,
      `SUMMARY:${icsEscape(e.summary)}`,
      `LOCATION:${icsEscape(e.location)}`,
      `DESCRIPTION:${description}`,
      ...ALARMS.flatMap((trigger) => [
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        `TRIGGER:${trigger}`,
        `DESCRIPTION:${icsEscape(e.summary)}`,
        'END:VALARM',
      ]),
      'END:VEVENT',
    ];
  });
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Petalpost//Invite//EN', ...events, 'END:VCALENDAR']
    .map(foldIcs)
    .join('\r\n');
}
