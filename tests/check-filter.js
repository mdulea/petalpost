// Fails when another Node check file run with a test name filter keeps running past the timeout or exits with a non-zero
// status, or when tests/check-site.js filtered to one test passes no test. Each run is a child process.
// Run: node tests/check-filter.js
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const TIMEOUT_MS = 60000;

// Under node --test, NODE_TEST_CONTEXT makes a child report in the runner's binary protocol, so the child runs
// without it and prints the text summary.
const { NODE_TEST_CONTEXT, ...env } = process.env;

// A hook or server that outlives the filtered tests keeps the child alive, and the timeout fails the case.
const runFiltered = (file, pattern) =>
  spawnSync(process.execPath, [`--test-name-pattern=${pattern}`, fileURLToPath(new URL(file, import.meta.url))], {
    encoding: 'utf8',
    env,
    timeout: TIMEOUT_MS,
  });

test('tests/check-site.js filtered to one test passes it and exits', () => {
  const { status, signal, stdout } = runFiltered('./check-site.js', '^robots\\.txt names the sitemap$');
  assert.deepEqual({ status, signal }, { status: 0, signal: null }, stdout);
  assert.ok(Number(stdout.match(/^ℹ pass (\d+)$/m)?.[1]) >= 1, stdout);
});

const checkFiles = readdirSync(new URL('.', import.meta.url)).filter(
  (file) => /^check-.+\.js$/.test(file) && file !== 'check-filter.js',
);
for (const file of checkFiles) {
  test(`tests/${file} filtered to no test exits with status 0`, () => {
    const { status, signal, stdout } = runFiltered(`./${file}`, 'no test has this name');
    assert.deepEqual({ status, signal }, { status: 0, signal: null }, stdout);
  });
}
