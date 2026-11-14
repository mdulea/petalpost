import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['vendor/', '.worktrees/', 'test-results/', 'playwright-report/'] },
  js.configs.recommended,
  {
    // Destructuring a key next to a rest element drops that key from the copy, as shareLink does with photoY.
    rules: { 'no-unused-vars': ['error', { ignoreRestSiblings: true }] },
  },
  {
    files: ['js/**/*.js'],
    languageOptions: { globals: { ...globals.browser, htmlToImage: 'readonly' } },
  },
  { files: ['js/analytics.js'], languageOptions: { sourceType: 'script' } },
  { files: ['scripts/**/*.js', '*.config.js'], languageOptions: { globals: globals.node } },
  // Callbacks passed to page.evaluate run in the browser.
  {
    files: ['scripts/browser.spec.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser, htmlToImage: 'readonly' } },
  },
];
