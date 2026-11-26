// Checks that a pasted guest list keeps one name per non-empty line.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parsePartyNames } from '../public/js/party-names.js';

test('pasted names keep their order, duplicates and punctuation and skip blank lines', () => {
  assert.deepEqual(parsePartyNames(' Ana, Jr. \r\n \r\nAna, Jr.\n\t\n Ștefan\rDana '), [
    'Ana, Jr.',
    'Ana, Jr.',
    'Ștefan',
    'Dana',
  ]);
});
