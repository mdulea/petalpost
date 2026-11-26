// Checks DOM-free guest-list logic: pasted names keep one name per non-empty line, totals count accepted seats,
// declined parties and pending parties, and search with the status filter matches normalized names and link or reply state.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizePartySearch, parsePartyNames, partyMatches, partyTotals } from '../public/js/guest-list.js';

test('pasted names keep their order, duplicates and punctuation and skip blank lines', () => {
  assert.deepEqual(parsePartyNames(' Ana, Jr. \r\n \r\nAna, Jr.\n\t\n Ștefan\rDana '), [
    'Ana, Jr.',
    'Ana, Jr.',
    'Ștefan',
    'Dana',
  ]);
});

test('totals sum accepted seats, declined parties and parties without a reply', () => {
  const parties = [
    { name: 'Ana', reply: { attending: true, partySize: 3 } },
    { name: 'Dan', reply: { attending: true, partySize: 2 } },
    { name: 'Mia', reply: { attending: false, partySize: 0 } },
    { name: 'Radu', reply: null },
  ];
  assert.deepEqual(partyTotals(parties), { accepted: 5, declined: 1, pending: 1 });
});

test('search and status filter match normalized party names and reply state', () => {
  const replied = { name: 'Ștefan Popescu', reply: { attending: true, partySize: 2 } };
  const pending = { name: 'Ana Ionescu', reply: null };
  const opened = { ...pending, firstOpenedAt: '2026-11-26T12:00:00.000Z' };
  const query = normalizePartySearch('  ștefan ');
  assert.deepEqual(
    [
      partyMatches(replied, query, 'all'),
      partyMatches(replied, query, 'replied'),
      partyMatches(replied, query, 'pending'),
      partyMatches(pending, query, 'all'),
      partyMatches(pending, '', 'pending'),
      partyMatches(pending, '', 'replied'),
      partyMatches(pending, '', 'notOpened'),
      partyMatches(pending, '', 'opened'),
      partyMatches(opened, 'ana', 'opened'),
      partyMatches(opened, 'ana', 'pending'),
      partyMatches(opened, 'stefan', 'opened'),
    ],
    [true, true, false, false, true, false, true, false, true, true, false],
  );
});
