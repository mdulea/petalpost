// Fails when the replies CSV breaks. Checks: the UTF-8 byte order mark; the English comma and the Romanian semicolon;
// the column order and the localized answers; an empty "Changed" cell for a reply that never changed; times in the
// runtime's time zone as year-month-day hours:minutes; the localized file name with the download date; the leading
// apostrophe on cells that start with =, +, -, @, a tab or a carriage return; RFC 4180 quoting with doubled inner
// quotes; no totals row. The guest-list export shares those rules and includes parties with or without replies.
// The checks run in the Europe/Bucharest time zone, so a time near midnight UTC shows the next day.
// Run: pnpm exec node tests/check-csv.js
import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.TZ = 'Europe/Bucharest';
const { guestListCsv, repliesCsv, repliesCsvName } = await import('../public/js/csv.js');
const BOM = String.fromCharCode(0xfeff);

const sam = {
  name: 'Sam',
  attending: true,
  partySize: 2,
  note: '',
  createdAt: '2026-07-01T21:05:00.000Z',
  updatedAt: '2026-07-01T21:05:00.000Z',
};
const ana = {
  name: 'Ana Ștefănescu',
  attending: false,
  partySize: 0,
  note: 'Sorry, we are away.',
  createdAt: '2026-01-10T08:00:00.000Z',
  updatedAt: '2026-01-12T09:30:00.000Z',
};

test('the English file starts with a byte order mark and separates values with commas', () => {
  assert.equal(
    repliesCsv([sam, ana], 'en'),
    BOM +
      'Name,Attending,Party size,Note,Replied,Changed\r\n' +
      'Sam,Yes,2,,2026-07-02 00:05,\r\n' +
      'Ana Ștefănescu,No,0,"Sorry, we are away.",2026-01-10 10:00,2026-01-12 11:30\r\n',
  );
});

test('the Romanian file separates values with semicolons and answers Da or Nu', () => {
  assert.equal(
    repliesCsv([sam, { ...ana, note: 'Ne pare rău; suntem plecați.' }], 'ro'),
    BOM +
      'Nume;Participă;Persoane;Notă;A răspuns;Modificat\r\n' +
      'Sam;Da;2;;2026-07-02 00:05;\r\n' +
      'Ana Ștefănescu;Nu;0;"Ne pare rău; suntem plecați.";2026-01-10 10:00;2026-01-12 11:30\r\n',
  );
});

test('a file without replies holds only the column names', () => {
  assert.equal(repliesCsv([], 'en'), BOM + 'Name,Attending,Party size,Note,Replied,Changed\r\n');
});

test('cells that a spreadsheet would run as a formula start with an apostrophe', () => {
  const rows = ['=1+1', '+40', '-2', '@SUM(A1)', '\tx', '\rx'].map(
    (name) =>
      repliesCsv([{ ...sam, name }], 'en')
        .split('\r\n')[1]
        .split(',')[0],
  );
  assert.deepEqual(rows, ["'=1+1", "'+40", "'-2", "'@SUM(A1)", "'\tx", `"'\rx"`]);
});

test('a value with a quote, the separator or a line break is quoted with its quotes doubled', () => {
  const csv = repliesCsv([{ ...sam, name: 'Sam "the host" Lee', note: 'No nuts.\nWe arrive at 3, maybe 4.' }], 'en');
  assert.equal(
    csv.split('\r\n')[1],
    '"Sam ""the host"" Lee",Yes,2,"No nuts.\nWe arrive at 3, maybe 4.",2026-07-02 00:05,',
  );
});

test('the file name names the download date in the page language', () => {
  const now = new Date('2026-07-01T21:05:00.000Z');
  assert.deepEqual(
    [repliesCsvName('en', now), repliesCsvName('ro', now)],
    ['petalpost-replies-2026-07-02.csv', 'petalpost-raspunsuri-2026-07-02.csv'],
  );
});

test('the guest-list CSV exports replied and pending parties with localized, spreadsheet-safe cells', () => {
  const parties = [
    { name: '=Ana "Jr."', defaultSeats: 4, reply: { attending: true, partySize: 2, note: '@Note,1;2\nLine' } },
    { name: 'Ștefan', defaultSeats: 3, reply: null },
    { name: 'Daria', defaultSeats: 2, reply: { attending: false, partySize: 0, note: '' } },
  ];
  assert.deepEqual(
    [guestListCsv(parties, 'en'), guestListCsv(parties, 'ro')],
    [
      BOM +
        'Name,Status,Seats,Attending,Note\r\n' +
        `"'=Ana ""Jr.""",Replied,2,Yes,"'@Note,1;2\nLine"\r\nȘtefan,No reply yet,3,,\r\nDaria,Replied,0,No,\r\n`,
      BOM +
        'Nume;Stare;Locuri;Participă;Notă\r\n' +
        `"'=Ana ""Jr.""";A răspuns;2;Da;"'@Note,1;2\nLine"\r\nȘtefan;Fără răspuns;3;;\r\nDaria;A răspuns;0;Nu;\r\n`,
    ],
  );
});
