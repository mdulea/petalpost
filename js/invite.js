// Invite records, share links and the calendar file. No DOM access, so scripts/check-invite.js runs it in Node.

const FIELDS = ['eyebrow', 'title', 'hosts', 'date', 'time', 'venue', 'address', 'message', 'rsvp'];

// The only constructor for invite data: template sample text, then valid fields from source.
function makeInviteData(template, source) {
  const s = { ...source };
  const d = { ...template.defaults };
  FIELDS.forEach((f) => { if (typeof s[f] === 'string') d[f] = s[f]; });
  d.photoY = s.photoY != null && Number.isFinite(Number(s.photoY)) ? Number(s.photoY) : 50;
  d.accent = ACCENTS.some((a) => a.hex === s.accent) ? s.accent : null;
  return d;
}

// Fields still holding the old template's sample text take the new template's text; user edits stay.
function switchTemplate(state, id) {
  const from = getTemplate(state.t);
  const to = getTemplate(id);
  FIELDS.forEach((f) => {
    if (!state.d[f] || state.d[f] === from.defaults[f]) state.d[f] = to.defaults[f];
  });
  state.t = to.id;
}

// Untrusted {t, d} from a share link or the stored draft becomes a record, or null.
function restoreInvite(value) {
  if (!value || typeof value !== 'object') return null;
  const template = getTemplate(value.t);
  return { t: template.id, d: makeInviteData(template, value.d) };
}

// Share links open the guest view; the photo position stays with the owner's draft.
function shareLink(base, record) {
  const { photoY, ...fields } = record.d;
  return `${base}?view=1#d=${encodeState({ t: record.t, d: fields })}`;
}

// Load order: a share link wins and carries no photo; otherwise the stored draft or a new invite,
// switched to the requested template. Inputs are the raw hash, storage and ?t= strings.
function openInvite({ hash = '', draft = null, photo = null, requested = null }) {
  const shared = hash.startsWith('#d=') ? restoreInvite(decodeState(hash.slice(3))) : null;
  if (shared) return { ...shared, photo: null };
  let saved = null;
  try { saved = JSON.parse(draft); } catch { saved = null; }
  const state = { ...(restoreInvite(saved) || restoreInvite({ t: requested })), photo };
  if (requested && requested !== state.t) switchTemplate(state, requested);
  return state;
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

const slug = (text) => (text || 'invite').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'invite';

function icsEscape(text) {
  return String(text || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

// Events last three hours in floating local time; data.date is required. now sets DTSTAMP.
function buildIcs(data, now) {
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
