// Invite records, share links and the calendar file. No DOM access, so tests/check-invite.js runs it in Node.

import { eventFields } from './countdown.js';
import { UI, normalizeLang } from './i18n.js';
import { ID_PATTERN, SECRET_PATTERN } from './rsvp.js';
import { ACCENTS, formatDate, formatTime, getTemplate, localizeTemplate, PHOTO_URL, TEMPLATES } from './templates.js';

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
  return d;
}

// Editor input for one field, through the same rules as makeInviteData. Returns false for an unknown name.
export function updateInvite(state, name, value, lang = 'en') {
  if (!EDITABLE.includes(name)) return false;
  state.d = makeInviteData(getTemplate(state.t, lang), { ...state.d, [name]: value }, lang);
  return true;
}

// Text goes back to the template sample, the accent to the template default; the photo position and mode stay.
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
// before invitations had modes sends, gets the open mode. The photo position stays with the owner's draft, so d has
// no photoY.
export function readPublished(value) {
  if (!value || typeof value !== 'object' || !TEMPLATES.some((t) => t.id === value.t)) return null;
  const s = value.d;
  if (!s || typeof s !== 'object') return null;
  const hasMode = Object.hasOwn(s, 'mode');
  if (Object.keys(s).length !== FIELDS.length + (hasMode ? 2 : 1) || (hasMode && !MODES.includes(s.mode))) return null;
  const valid = FIELDS.every(
    (f) =>
      typeof s[f] === 'string' &&
      (!FIELD_LIMITS[f] || s[f].length <= FIELD_LIMITS[f]) &&
      (!FIELD_FORMATS[f] || FIELD_FORMATS[f](s[f])),
  );
  if (!valid || !(s.accent === null || ACCENTS.some((a) => a.hex === s.accent))) return null;
  const d = {};
  [...FIELDS, 'accent'].forEach((f) => {
    d[f] = s[f];
  });
  d.mode = modeOf(s);
  return { t: value.t, d };
}

// The invitation link of a published event opens the guest view at /e/<id> (or /ro/e/<id>), serving dynamic link metadata.
export const eventLink = (origin, id, lang = 'en') => `${origin}${normalizeLang(lang) === 'ro' ? '/ro' : ''}/e/${id}`;

// Link preview and native share metadata built from an invite's title, date, time and venue. details is the date and
// venue line, empty when the invite has neither; description falls back to generic copy then.
// locale fixes date and time formatting on the server so link previews stay consistent across regions.
export function eventPreviewMeta(data, locale = 'en-US') {
  const isRo = typeof locale === 'string' && locale.toLowerCase().startsWith('ro');
  const title = (data.title || '').trim() || (isRo ? 'Ești invitat' : 'You are invited');
  const dateText = formatDate(data.date, locale);
  const timeText = formatTime(data.time, locale);
  const when = isRo
    ? [dateText, timeText ? `ora ${timeText}` : ''].filter(Boolean).join(', ')
    : [dateText, timeText].filter(Boolean).join(' at ');
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

// A WhatsApp link that opens a message with the invite's title, its date and venue line, and url, each on its own
// line and with empty lines left out. url is the invitation link from eventLink, never the management link.
export function whatsappLink(data, locale, url) {
  const { title, details } = eventPreviewMeta(data, locale);
  return `https://wa.me/?text=${encodeURIComponent([title, details, url].filter(Boolean).join('\n'))}`;
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

// A calendar app shows an alarm one day and two hours before the event.
const ALARMS = ['-P1D', '-PT2H'];

// data: a record from makeInviteData. Events last three hours in floating local time and carry ALARMS. now sets
// DTSTAMP. Returns null when the date is empty.
export function buildIcs(data, now) {
  const fields = eventFields(data);
  if (!fields) return null;
  // The UTC clock holds the floating local time, so no time zone shifts it.
  const start = new Date(Date.UTC(...fields));
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  const local = (date) =>
    date
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d+Z$/, '');
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Petalpost//Invite//EN',
    'BEGIN:VEVENT',
    `UID:${data.date.replace(/-/g, '')}-${slug(data.title)}@petalpost`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${local(start)}`,
    `DTEND:${local(end)}`,
    `SUMMARY:${icsEscape(data.title)}`,
    `LOCATION:${icsEscape([data.venue, data.address].filter(Boolean).join(', '))}`,
    `DESCRIPTION:${icsEscape([data.hosts, data.message, data.rsvp].filter(Boolean).join('\n'))}`,
    ...ALARMS.flatMap((trigger) => [
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `TRIGGER:${trigger}`,
      `DESCRIPTION:${icsEscape(data.title)}`,
      'END:VALARM',
    ]),
    'END:VEVENT',
    'END:VCALENDAR',
  ]
    .map(foldIcs)
    .join('\r\n');
}
