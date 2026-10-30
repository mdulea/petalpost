// Invite records, share links and the calendar file. No DOM access, so scripts/check-invite.js runs it in Node.

import { ACCENTS, getTemplate, PHOTO_URL } from './templates.js';

// Text fields and their length limits; editor.js copies each limit to its input. Date and time have none.
export const FIELD_LIMITS = { eyebrow: 60, title: 48, hosts: 60, date: null, time: null, venue: 60, address: 90, message: 110, rsvp: 40 };
export const FIELDS = Object.keys(FIELD_LIMITS);
// Every name the editor form writes, and every key of a record.
export const EDITABLE = [...FIELDS, 'photoY', 'accent'];
// Date and time take the editor input formats, YYYY-MM-DD for a real day and HH:MM, or empty for a cleared input.
const FIELD_FORMATS = {
  date: (v) => v === '' || (/^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00Z`).toISOString().startsWith(v)),
  time: (v) => /^(([01]\d|2[0-3]):[0-5]\d)?$/.test(v),
};

// The only constructor for invite data: template sample text, then valid fields from source, cut to their limits.
export function makeInviteData(template, source) {
  const s = { ...source };
  const d = { ...template.defaults };
  FIELDS.forEach((f) => {
    if (typeof s[f] !== 'string' || (FIELD_FORMATS[f] && !FIELD_FORMATS[f](s[f]))) return;
    d[f] = FIELD_LIMITS[f] ? s[f].slice(0, FIELD_LIMITS[f]) : s[f];
  });
  d.photoY = s.photoY != null && Number.isFinite(Number(s.photoY)) ? Number(s.photoY) : 50;
  d.accent = ACCENTS.some((a) => a.hex === s.accent) ? s.accent : null;
  return d;
}

// Editor input for one field, through the same rules as makeInviteData. Returns false for an unknown name.
export function updateInvite(state, name, value) {
  if (!EDITABLE.includes(name)) return false;
  state.d = makeInviteData(getTemplate(state.t), { ...state.d, [name]: value });
  return true;
}

// Text goes back to the template sample, the accent to the template default; the photo position stays.
export function resetInvite(state) {
  state.d = makeInviteData(getTemplate(state.t), { photoY: state.d.photoY });
}

// Fields still holding the old template's sample text take the new template's text; edited and cleared fields stay.
export function switchTemplate(state, id) {
  const from = getTemplate(state.t);
  const to = getTemplate(id);
  const kept = { ...state.d };
  FIELDS.forEach((f) => {
    if (kept[f] === from.defaults[f]) delete kept[f];
  });
  state.d = makeInviteData(to, kept);
  state.t = to.id;
}

// Untrusted {t, d} from a share link or the stored draft becomes a record, or null.
function restoreInvite(value) {
  if (!value || typeof value !== 'object') return null;
  const template = getTemplate(value.t);
  return { t: template.id, d: makeInviteData(template, value.d) };
}

// The only writer of the photo: a JPEG or PNG data URL, or null to remove it.
// Returns false and keeps the current photo for anything else, such as the "data:," export of an empty canvas.
export function setPhoto(state, url) {
  if (url !== null && !PHOTO_URL.test(url)) return false;
  state.photo = url;
  return true;
}

// Editor URLs: ?t= opens a template for the owner, ?view=1 opens the guest view. openInvite parses both.
export const editorUrl = (id) => `editor.html?t=${encodeURIComponent(id)}`;

// Share links open the guest view; the photo position stays with the owner's draft.
export function shareLink(base, record) {
  const { photoY, ...fields } = record.d;
  return `${base}?view=1#d=${encodeState({ t: record.t, d: fields })}`;
}

// The stored draft keeps the whole record, photo position included; openInvite reads it back.
export function draftOf(record) {
  return JSON.stringify({ t: record.t, d: record.d });
}

// Load order: a share link wins and carries no photo; otherwise the stored draft or a new invite,
// switched to the ?t= template. Inputs are the raw search, hash and storage strings; guest is true for ?view=1.
export function openInvite({ search = '', hash = '', draft = null, photo = null }) {
  const params = new URLSearchParams(search);
  const guest = params.get('view') === '1';
  const requested = params.get('t');
  const shared = hash.startsWith('#d=') ? restoreInvite(decodeState(hash.slice(3))) : null;
  if (shared) return { ...shared, photo: null, guest };
  let saved = null;
  try { saved = JSON.parse(draft); } catch { saved = null; }
  const state = { ...(restoreInvite(saved) || restoreInvite({ t: requested })), photo: null, guest };
  setPhoto(state, photo);
  if (requested && requested !== state.t) switchTemplate(state, requested);
  return state;
}

// Storage keeps the owner's draft and photo for a reload. storage has the localStorage shape;
// a blocked or full storage throws, and the reads and writes below treat that as no value or a refused write.
const DRAFT_KEY = 'petalpost:draft';
const PHOTO_KEY = 'petalpost:photo';

function readStorage(storage, key) {
  try { return storage.getItem(key); } catch { return null; }
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

// The stored draft and photo strings, as openInvite takes them.
export const storedInvite = (storage) => ({ draft: readStorage(storage, DRAFT_KEY), photo: readStorage(storage, PHOTO_KEY) });

// The guest view never writes: a share link opens on the owner's origin and would overwrite the owner's draft.
export function saveDraft(state, storage) {
  if (!state.guest) writeStorage(storage, DRAFT_KEY, draftOf(state));
}

// Call only when the photo changes. A photo that does not fit removes the stored one and returns false.
export function savePhoto(state, storage) {
  if (state.guest || writeStorage(storage, PHOTO_KEY, state.photo)) return true;
  writeStorage(storage, PHOTO_KEY, null);
  return false;
}

// Share links store {t, d} as URL-safe base64 JSON in the hash.
function encodeState(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
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

export const slug = (text) => (text || 'invite').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'invite';

function icsEscape(text) {
  return String(text || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

// data: a record from makeInviteData. Events last three hours in floating local time. now sets DTSTAMP.
// Returns null when the date is empty.
export function buildIcs(data, now) {
  if (!data.date) return null;
  const [y, mo, day] = data.date.split('-').map(Number);
  const [h, m] = (data.time || '12:00').split(':').map(Number);
  const start = new Date(Date.UTC(y, mo - 1, day, h, m));
  const end = new Date(start.getTime() + 3 * 60 * 60 * 1000);
  const local = (date) => date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, '');
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Petalpost//Invite//EN', 'BEGIN:VEVENT',
    `UID:${data.date.replace(/-/g, '')}-${slug(data.title)}@petalpost`, `DTSTAMP:${stamp}`,
    `DTSTART:${local(start)}`, `DTEND:${local(end)}`,
    `SUMMARY:${icsEscape(data.title)}`,
    `LOCATION:${icsEscape([data.venue, data.address].filter(Boolean).join(', '))}`,
    `DESCRIPTION:${icsEscape([data.hosts, data.message, data.rsvp].filter(Boolean).join('\n'))}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}
