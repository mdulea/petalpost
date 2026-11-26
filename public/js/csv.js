// The host's replies and guest list as CSV files for spreadsheets.
import { UI, normalizeLang } from './i18n.js';
import { answerTo, subEventTally } from './rsvp.js';

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

// Two columns for each sub-event of labels, from subEventLabels in invite.js: whether the reply attends it and its
// people. Both are empty for a missing reply and for a reply without an answer to the sub-event. A spreadsheet sums a
// people column for the sub-event's total.
function answerColumns(labels, lang) {
  const copy = UI[normalizeLang(lang)].subEventReplies;
  return labels.flatMap(({ name }) => [copy.csvAnswer(name), copy.csvPeople(name)]);
}
const answerCells = (labels, reply, copy) =>
  labels.flatMap(({ id }) => {
    const answer = reply && answerTo(reply, id);
    return answer ? [answer.attending ? copy.yes : copy.no, String(answer.partySize)] : ['', ''];
  });

// The totals row of a file with sub-events, with width cells: the total label first, and under the column pair of
// each sub-event the number of yes answers and the people attending, from index on. Without sub-events the file has
// no totals row.
function totalsRow(labels, replies, lang, width, index) {
  if (!labels.length) return [];
  const row = Array(width).fill('');
  row[0] = UI[normalizeLang(lang)].subEventReplies.csvTotal;
  const totals = subEventTally(
    labels.map(({ id }) => id),
    replies,
  );
  totals.forEach(({ yes, attending }, i) => {
    row[index + 2 * i] = String(yes);
    row[index + 2 * i + 1] = String(attending);
  });
  return [row];
}

function csv(rows, separator) {
  const lines = rows.map((row) => row.map((value) => cell(value, separator)).join(separator));
  return `${BOM}${lines.join('\r\n')}\r\n`;
}

// responses are the management data's replies [{name, attending, partySize, answers, note, createdAt, updatedAt}].
// The file has a header row and one row per reply, and rows end in CRLF. The separator is the one Excel expects for
// the page language. "Changed" is empty for a reply that never changed. The answer columns of the sub-events of labels
// follow the party size, and a totals row of the sub-events ends the file.
export function repliesCsv(responses, lang, labels = []) {
  const copy = UI[normalizeLang(lang)].csv;
  const rows = responses.map((r) => [
    r.name,
    r.attending ? copy.yes : copy.no,
    String(r.partySize),
    ...answerCells(labels, r, copy),
    r.note,
    dateTime(r.createdAt),
    r.updatedAt === r.createdAt ? '' : dateTime(r.updatedAt),
  ]);
  const [name, attending, partySize, ...rest] = copy.columns;
  const header = [name, attending, partySize, ...answerColumns(labels, lang), ...rest];
  const totals = totalsRow(labels, responses, lang, header.length, 3);
  return csv([header, ...rows, ...totals], copy.separator);
}

// The file name with the download date, such as petalpost-replies-2026-07-02.csv.
export const repliesCsvName = (lang, now) => `${UI[normalizeLang(lang)].csv.file}-${day(now)}.csv`;

// Exports every party in the management read. Seats come from the reply or the party's default before a reply. The
// answer columns of the sub-events of labels follow the attending column, and a totals row of the sub-events over the
// replies ends the file.
export function guestListCsv(parties, lang, labels = []) {
  const { csv: copy, guestList } = UI[normalizeLang(lang)];
  const rows = parties.map(({ name, defaultSeats, reply }) => [
    name,
    reply ? guestList.replied : guestList.noReply,
    String(reply?.partySize ?? defaultSeats),
    reply ? (reply.attending ? copy.yes : copy.no) : '',
    ...answerCells(labels, reply, copy),
    reply?.note ?? '',
  ]);
  const columns = guestList.csvColumns;
  const header = [...columns.slice(0, -1), ...answerColumns(labels, lang), columns.at(-1)];
  const replies = parties.map(({ reply }) => reply).filter(Boolean);
  const totals = totalsRow(labels, replies, lang, header.length, columns.length - 1);
  return csv([header, ...rows, ...totals], copy.separator);
}

// The file name with the download date in the page language.
export const guestListCsvName = (lang, now) => `${UI[normalizeLang(lang)].guestList.csvFile}-${day(now)}.csv`;
