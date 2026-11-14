import js from '@eslint/js';
import globals from 'globals';

export default [
  { ignores: ['vendor/', 'worktrees/'] },
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
  { files: ['scripts/**/*.js', 'eslint.config.js'], languageOptions: { globals: globals.node } },
];
