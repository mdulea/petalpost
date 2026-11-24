// Fails when pnpm shot does not write a PNG of the element that the selector matches, does not write a PNG of the full
// page without a selector or for a path without its leading slash, or, for a selector that matches nothing, exits with
// status 0, prints no message naming the selector, writes a file or keeps running. Fails too when it accepts a path
// on another origin, an empty selector or a path that answers 404. Each case runs the command on its own free port with Chromium.
// Run: pnpm exec node tests/check-shot.js
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

const SCRIPT = fileURLToPath(new URL('../scripts/shot.js', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'petalpost-shot-'));
after(() => rmSync(dir, { recursive: true, force: true }));

// A command that keeps the server or the browser open never exits, and the timeout fails the case.
const shot = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8', timeout: 60000 });

// The width and height in a PNG's header, or null when the file is not a PNG.
const pngSize = (file) => {
  const bytes = readFileSync(file);
  if (!bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return null;
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
};

test('a selector gives a PNG of that element, smaller than the viewport', () => {
  const file = join(dir, 'brand.png');
  const result = shot('/', '.brand', file);
  assert.equal(result.status, 0, result.stderr);
  const size = pngSize(file);
  assert.ok(size, 'not a PNG');
  assert.ok(size.width < 1280 && size.height < 720, `${size.width}x${size.height} is not the element`);
});

test('no selector gives a PNG of the full page, taller than the viewport', () => {
  const file = join(dir, 'page.png');
  const result = shot('/about.html', file);
  assert.equal(result.status, 0, result.stderr);
  const size = pngSize(file);
  assert.ok(size, 'not a PNG');
  assert.equal(size.width, 1280);
  assert.ok(size.height > 720, `${size.height} is not the full page`);
});

test('a path without its leading slash opens the same page', () => {
  const file = join(dir, 'brand-slashless.png');
  const result = shot('index.html', '.brand', file);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(pngSize(file), 'not a PNG');
});

test('a path that answers 404 exits non-zero with its status and writes no file', () => {
  const file = join(dir, 'not-found.png');
  const result = shot('/no-such-page.html', file);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no-such-page\.html answers with status 404/);
  assert.equal(existsSync(file), false);
});

test('an empty selector exits non-zero instead of writing the full page', () => {
  const file = join(dir, 'empty.png');
  const result = shot('/', '', file);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /selector is empty/);
  assert.equal(existsSync(file), false);
});

test('a selector that matches nothing exits non-zero with a message and writes no file', () => {
  const file = join(dir, 'missing.png');
  const result = shot('/', '#no-such-element', file);
  assert.equal(result.error, undefined, 'the command kept running');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /#no-such-element/);
  assert.equal(existsSync(file), false);
});

test('a path on another origin, as Git Bash makes from a leading slash, exits non-zero and writes no file', () => {
  const file = join(dir, 'elsewhere.png');
  const result = shot('C:/Program Files/Git/editor.html', file);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not a path on the site/);
  assert.equal(existsSync(file), false);
});
