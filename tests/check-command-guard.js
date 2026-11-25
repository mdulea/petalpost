// Fails when the agent command hook lets through a command that calls node or npx directly at its start, after a
// separator or after variable assignments, rejects pnpm exec node, another pnpm command or node as an argument, or
// when the hook reads a rejected command from its stdin and exits with other than status 2 and a message naming
// pnpm exec, or exits with other than status 0 for an allowed command.
// Run: pnpm exec node tests/check-command-guard.js
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { directNodeCall } from '../scripts/command-guard.js';

const SCRIPT = fileURLToPath(new URL('../scripts/command-guard.js', import.meta.url));

const REJECTED = [
  'node scripts/pages.js',
  'npx prettier --check .',
  '  node -e "1"',
  'cd tests && node check-site.js',
  'git status; npx eslint .',
  'pnpm test || node tests/check-csv.js',
  'cat input.json | node scripts/command-guard.js',
  'pnpm lint\nnode tests/check-paths.js',
  'echo $(node -v)',
  'echo `npx -v`',
  'TZ=UTC node scripts/pages.js',
  'node',
];

const ALLOWED = [
  'pnpm exec node tests/check-site.js',
  'pnpm exec prettier --check .',
  'pnpm test',
  'pnpm check && pnpm exec node --test tests/check-site.js',
  'ls node_modules',
  'grep -n "node" README.md',
  'git commit -m "Run checks with pnpm exec node"',
  'nodemon --version',
];

test('the hook rejects a command that calls node or npx directly', () =>
  assert.deepEqual(
    REJECTED.filter((command) => !directNodeCall(command)),
    [],
  ));

test('the hook allows pnpm exec node, other pnpm commands and node as an argument', () =>
  assert.deepEqual(ALLOWED.filter(directNodeCall), []));

const hook = (command) =>
  spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
  });

test('the hook exits with status 2 and names pnpm exec for a rejected command', () => {
  const result = hook('npx eslint .');
  assert.deepEqual([result.status, result.stderr.includes('pnpm exec')], [2, true]);
});

test('the hook exits with status 0 for an allowed command', () => {
  const result = hook('pnpm exec node tests/check-site.js');
  assert.deepEqual([result.status, result.stderr], [0, '']);
});

test('.claude/settings.json runs the hook before every shell command', () => {
  const settings = JSON.parse(readFileSync(new URL('../.claude/settings.json', import.meta.url), 'utf8'));
  const commands = settings.hooks.PreToolUse.filter(({ matcher }) => matcher === 'Bash|PowerShell').flatMap(
    ({ hooks }) => hooks.map(({ command }) => command),
  );
  assert.ok(commands.some((command) => command.includes('scripts/command-guard.js')));
});
