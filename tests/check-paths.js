// Fails when a comment in a tracked .js, .css, .html or .sql file, or a tracked Markdown file, names a file path that
// exists neither from the repository root, nor from public/ as a site path, nor from the naming file's directory. A
// path counts when it has at least one slash and ends in .js, .css, .html, .sql, .json, .md or .ts. Globs, URLs and
// the historical records in docs/decisions/ are exempt.
// Run: pnpm exec node tests/check-paths.js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const PATH = /(?<![\w./@:*{-])(?:\.{1,2}\/)?[\w.-]+(?:\/[\w.-]+)+\.(?:js|css|html|sql|json|md|ts)\b(?![*{])/g;
const COMMENT = /\/\/[^\n]*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->/g;

const files = execFileSync('git', ['ls-files', '*.js', '*.css', '*.html', '*.sql', '*.md'], {
  cwd: root,
  encoding: 'utf8',
})
  .split('\n')
  .filter((file) => file && !file.startsWith('docs/decisions/') && !file.startsWith('public/vendor/'));

test('every file path named in a comment or Markdown file exists', () => {
  const missing = [];
  for (const file of files) {
    const text = readFileSync(join(root, file), 'utf8');
    const prose = file.endsWith('.md') ? text : (text.match(COMMENT) ?? []).join('\n');
    for (const [path] of prose.matchAll(PATH)) {
      const found = [root, join(root, 'public'), join(root, dirname(file))].some((base) =>
        existsSync(join(base, path)),
      );
      if (!found) missing.push(`${file}: ${path}`);
    }
  }
  assert.deepEqual(missing, []);
});
