// Fails when a DOM-free module fails to load in Node or references the browser globals document or window.
// DOM_FREE is the list of DOM-free modules: the browser, scripts/ and server/ share them, and the Node checks run them.
// Run: pnpm exec node tests/check-dom-free.js
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { Linter } from 'eslint';

const DOM_FREE = [
  'public/js/i18n.js',
  'public/js/invite.js',
  'public/js/rsvp.js',
  'public/js/templates.js',
  'public/js/templates-ro.js',
];

const linter = new Linter();
/** @type {import('eslint').Linter.Config} */
const config = {
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  rules: { 'no-restricted-globals': ['error', 'document', 'window'] },
};

for (const file of DOM_FREE) {
  test(`${file} loads in Node and references neither document nor window`, async () => {
    const url = new URL(`../${file}`, import.meta.url);
    await import(url.href);
    const messages = linter.verify(readFileSync(url, 'utf8'), config, file);
    assert.deepEqual(
      messages.map(({ line, message }) => `${file}:${line} ${message}`),
      [],
    );
  });
}
