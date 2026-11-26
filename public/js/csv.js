// The host's replies and guest list as CSV files for spreadsheets.
import { UI, normalizeLang } from './i18n.js';

// Excel reads a file without a byte order mark in the system code page and breaks the diacritics.
const BOM = String.fromCharCode(0xfeff);

const pad = (n) => String(n).padStart(2, '0');
// Dates and times use the runtime's time zone, which in the browser is the host's.
const day = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const dateTime = (iso) => {
  const date = new Date(iso);
  return `${day(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// A spreadsheet runs a cell that starts with =, +, -, @, a tab or a carriage return as a formula, so such a cell
// gets a leading apostrophe. A cell with a quote, the separator or a line break is quoted, with its quotes doubled,
// per RFC 4180.
function cell(value, separator) {
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /["\r\n]/.test(text) || text.includes(separator) ? `"${text.replaceAll('"', '""')}"` : text;
}

function csv(rows, separator) {
  const lines = rows.map((row) => row.map((value) => cell(value, separator)).join(separator));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

// responses are the management data's replies [{name, attending, partySize, note, createdAt, updatedAt}]. The file
// has a header row and one row per reply, with no totals row, and rows end in CRLF. The separator is the one Excel
// expects for the page language. "Changed" is empty for a reply that never changed.
export function repliesCsv(responses, lang) {
  const copy = UI[normalizeLang(lang)].csv;
  const rows = responses.map((r) => [
    r.name,
    r.attending ? copy.yes : copy.no,
    String(r.partySize),
    r.note,
    dateTime(r.createdAt),
    r.updatedAt === r.createdAt ? '' : dateTime(r.updatedAt),
  ]);
  return csv([copy.columns, ...rows], copy.separator);
}

// The file name with the download date, such as petalpost-replies-2026-07-02.csv.
export const repliesCsvName = (lang, now) => `${UI[normalizeLang(lang)].csv.file}-${day(now)}.csv`;

// Exports every party in the management read. Seats come from the reply or the party's default before a reply.
export function guestListCsv(parties, lang) {
  const { csv: copy, guestList } = UI[normalizeLang(lang)];
  const rows = parties.map(({ name, defaultSeats, reply }) => [
    name,
    reply ? guestList.replied : guestList.noReply,
    String(reply?.partySize ?? defaultSeats),
    reply ? (reply.attending ? copy.yes : copy.no) : '',
    reply?.note ?? '',
  ]);
  return csv([guestList.csvColumns, ...rows], copy.separator);
}

// The file name with the download date in the page language.
export const guestListCsvName = (lang, now) => `${UI[normalizeLang(lang)].guestList.csvFile}-${day(now)}.csv`;
