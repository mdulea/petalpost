// The host's replies as a CSV file for spreadsheets. It has no DOM access, so tests/check-csv.js runs it in Node.
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
  const lines = [copy.columns, ...rows].map((row) => row.map((v) => cell(v, copy.separator)).join(copy.separator));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

// The file name with the download date, such as petalpost-replies-2026-07-02.csv.
export const repliesCsvName = (lang, now) => `${UI[normalizeLang(lang)].csv.file}-${day(now)}.csv`;
