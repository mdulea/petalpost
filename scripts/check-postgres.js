// Fails when the production database adapter makes node-postgres warn about a deprecated SSL mode in the connection
// string that the Neon integration supplies.
// Run: node scripts/check-postgres.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connect } from '../server/postgres.js';

// Neon's DATABASE_URL ends in sslmode=require. Port 1 refuses the connection, after node-postgres has read the URL.
test('a Neon connection string with sslmode=require connects without an SSL mode warning', async () => {
  const warnings = [];
  const onWarning = (warning) => warnings.push(warning.message);
  process.on('warning', onWarning);
  const db = connect('postgresql://user:password@127.0.0.1:1/neondb?sslmode=require');
  try {
    await assert.rejects(db.query('select 1'));
    await new Promise((resolve) => setImmediate(resolve));
  } finally {
    process.off('warning', onWarning);
    await db.close();
  }
  assert.deepEqual(
    warnings.filter((message) => message.includes('SSL modes')),
    [],
  );
});
