import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['public/vendor/', 'dist/', '.pglite/', '.worktrees/'] },
  js.configs.recommended,
  {
    // Destructuring a key next to a rest element drops that key from the copy, as shareLink does with photoY.
    rules: { 'no-unused-vars': ['error', { ignoreRestSiblings: true }] },
  },
  {
    files: ['public/js/**/*.js'],
    languageOptions: { globals: { ...globals.browser, htmlToImage: 'readonly' } },
  },
  { files: ['public/js/analytics.js'], languageOptions: { sourceType: 'script' } },
  {
    files: ['scripts/**/*.js', 'tests/**/*.js', 'server/**/*.js', 'api/**/*.js', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
  // og-card.js runs in the browser, and so do callbacks that the spec files pass to page.evaluate.
  {
    files: ['tests/*.spec.js', 'scripts/og-card.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser, htmlToImage: 'readonly' } },
  },
];
