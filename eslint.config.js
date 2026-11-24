import js from '@eslint/js';
import globals from 'globals';

// The local hosts that a browser test must not name, as a regular expression source for ESLint selectors.
const LOCAL_HOST = String.raw`(localhost|127\.0\.0\.1|\[::1\])`;
const LOCAL_ORIGIN_MESSAGE =
  'Open a path such as /editor.html. Playwright resolves it against the base address of the run.';

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
        // A port in a string, or a template literal part that ends before the expression that gives the port.
        { selector: String.raw`Literal[value=/${LOCAL_HOST}:\d/]`, message: LOCAL_ORIGIN_MESSAGE },
        { selector: String.raw`TemplateElement[value.raw=/${LOCAL_HOST}:(\d|$)/]`, message: LOCAL_ORIGIN_MESSAGE },
      ],
    },
  },
];
