// Fails when browserCheckPort gives the same worktree path different ports, gives two sample worktrees the same port,
// gives a worktree a port outside WORKTREE_PORTS or the pnpm dev port, gives the main checkout or a copy without .git
// a port other than DEFAULT_PORT, ignores BROWSER_CHECK_PORT, or accepts a BROWSER_CHECK_PORT that is not a port. Fails
// too when ESLint accepts a local origin with a port written into a browser test, in a string or a template literal, or
// rejects a colon outside a local origin or a local host without a port.
// Run: pnpm exec node tests/check-browser-port.js
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ESLint } from 'eslint';
import { DEFAULT_PORT, PORT_ENV, WORKTREE_PORTS, browserCheckPort } from '../scripts/browser-port.js';

// The ports hash from the full paths, so the sample worktrees sit at fixed paths and get the same ports on every run.
// Worktrees run this check at the same time, so the paths are created when missing and never deleted.
const dir = join(tmpdir(), 'petalpost-port-check');

// A linked worktree has a .git file that points at the main checkout's .git directory.
const checkout = (name, linked) => {
  const root = join(dir, name);
  mkdirSync(root, { recursive: true });
  if (linked) writeFileSync(join(root, '.git'), 'gitdir: elsewhere\n');
  else mkdirSync(join(root, '.git'), { recursive: true });
  return root;
};
const main = checkout('main', false);
const guestList = checkout('feat-guest-list', true);
const footerLinks = checkout('fix-footer-links', true);

test('the main checkout uses DEFAULT_PORT', () => {
  assert.equal(browserCheckPort(main, {}), DEFAULT_PORT);
});

test('the same worktree path gives the same port on each call', () => {
  assert.equal(browserCheckPort(guestList, {}), browserCheckPort(guestList, {}));
});

test('feat-guest-list and fix-footer-links get different ports inside WORKTREE_PORTS, never the pnpm dev port', () => {
  const ports = [guestList, footerLinks].map((root) => browserCheckPort(root, {}));
  assert.notEqual(ports[0], ports[1]);
  for (const port of ports) {
    assert.ok(port >= WORKTREE_PORTS.first && port <= WORKTREE_PORTS.last, `${port} is outside WORKTREE_PORTS`);
    assert.notEqual(port, 3000);
    assert.notEqual(port, DEFAULT_PORT);
  }
});

test(`${PORT_ENV} wins over the derived and the default port`, () => {
  assert.equal(browserCheckPort(guestList, { [PORT_ENV]: '4999' }), 4999);
  assert.equal(browserCheckPort(main, { [PORT_ENV]: '5123' }), 5123);
});

test(`${PORT_ENV} that is not a port number throws with a message naming it`, () => {
  for (const value of ['abc', '0', '70000', '4321.5']) {
    assert.throws(() => browserCheckPort(main, { [PORT_ENV]: value }), new RegExp(`${PORT_ENV}.*"${value}"`));
  }
});

test('a copy without .git uses DEFAULT_PORT', () => {
  const copy = join(dir, 'copy');
  mkdirSync(copy, { recursive: true });
  assert.equal(browserCheckPort(copy, {}), DEFAULT_PORT);
});

const eslint = new ESLint();
const lintSpec = async (code) => {
  const [result] = await eslint.lintText(code, { filePath: 'tests/fixture.spec.js' });
  return result.messages.map(({ ruleId, message }) => `${ruleId}: ${message}`);
};

test('ESLint rejects a local origin with a port in a browser test', async () => {
  for (const code of [
    "export const address = 'http://localhost:4321/editor.html';\n",
    'export const address = `http://127.0.0.1:${4321}/`;\n',
    "export const address = 'http://[::1]:4321/';\n",
  ]) {
    assert.match((await lintSpec(code)).join('\n'), /no-restricted-syntax/, code);
  }
});

test('ESLint accepts a path that the base address resolves and a colon outside an origin', async () => {
  assert.deepEqual(await lintSpec("export const address = '/editor.html';\n"), []);
  assert.deepEqual(await lintSpec("export const time = 'ora 11:00';\n"), []);
});
