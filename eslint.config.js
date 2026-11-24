import js from '@eslint/js';
import globals from 'globals';

const LOCAL_ORIGIN = 'Open a path such as /editor.html. Playwright resolves it against the base address of the run.';

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
  // Each worktree runs the browser checks on its own port, so a test opens a path that the base address resolves.
  {
    files: ['tests/*.spec.js'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: String.raw`Literal[value=/(localhost|127\.0\.0\.1|\[::1\]):/]`, message: LOCAL_ORIGIN },
        { selector: String.raw`TemplateElement[value.raw=/(localhost|127\.0\.0\.1|\[::1\]):/]`, message: LOCAL_ORIGIN },
      ],
    },
  },
];
