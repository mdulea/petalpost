// Fails when the agent command hook lets through a command that calls node or npx directly at its start, after a
// separator or after variable assignments, rejects pnpm exec node, another pnpm command or node as an argument, or
// when the hook reads a rejected command from its stdin and exits with other than status 2 and a message naming
// pnpm exec, or exits with other than status 0 for an allowed command. Fails too when the hook lets through a
// pnpm check, pnpm check:fast or pnpm test:browser command that pipes into tail, head or grep without pipefail or
// that ends in ; echo of $?, rejects such a command with pipefail, a plain check or a Node check run by file, names no
// form that keeps the exit status, or when the hook command in .claude/settings.json exits with other than status 2
// and a message naming pnpm when pnpm fails to start.
// Run: pnpm exec node tests/check-command-guard.js
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { directNodeCall, hiddenCheckStatus } from '../scripts/command-guard.js';

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

const HIDDEN = [
  'pnpm check 2>&1 | tail -20',
  'pnpm check | grep -E "fail|pass"',
  'pnpm -s check:fast | head -5',
  'pnpm test:browser tests/layout.spec.js 2>&1 | tail',
  'pnpm check; echo exit $?',
  'pnpm check:fast > out.txt 2>&1; echo "exit $?"',
];

const SHOWN = [
  'set -o pipefail; pnpm check 2>&1 | tail -20',
  'set -o pipefail && pnpm test:browser 2>&1 | grep -E "passed|failed"',
  'pnpm check',
  'pnpm check 2>&1 | tail -20; exit ${PIPESTATUS[0]}',
  'pnpm exec node --test tests/check-csv.js | tail',
  'pnpm check && echo done',
  'pnpm fix; echo exit $?',
];

test('the hook rejects a check command whose pipe or trailing echo hides its exit status', () =>
  assert.deepEqual(
    HIDDEN.filter((command) => !hiddenCheckStatus(command)),
    [],
  ));

test('the hook allows a check with pipefail, a plain check and a Node check run by file', () =>
  assert.deepEqual(SHOWN.filter(hiddenCheckStatus), []));

const hook = (command) =>
  spawnSync(process.execPath, [SCRIPT], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }),
    encoding: 'utf8',
  });

test('the hook exits with status 2 and names pnpm exec for a rejected command', () => {
  const result = hook('npx eslint .');
  assert.deepEqual([result.status, result.stderr.includes('pnpm exec')], [2, true]);
});

test('the hook exits with status 2 and names set -o pipefail for a check whose exit status is hidden', () => {
  const result = hook('pnpm check 2>&1 | tail -20');
  assert.deepEqual([result.status, result.stderr.includes('set -o pipefail')], [2, true]);
});

test('the hook exits with status 0 for an allowed command', () => {
  const result = hook('pnpm exec node tests/check-site.js');
  assert.deepEqual([result.status, result.stderr], [0, '']);
});

const settings = JSON.parse(readFileSync(new URL('../.claude/settings.json', import.meta.url), 'utf8'));
const hookCommands = settings.hooks.PreToolUse.filter(({ matcher }) => matcher === 'Bash|PowerShell').flatMap(
  ({ hooks }) => hooks.map(({ command }) => command),
);

test('.claude/settings.json runs the hook before every shell command', () =>
  assert.ok(hookCommands.some((command) => command.includes('scripts/command-guard.js'))));

// A pnpm that exits with status 1 before it runs anything, first on the PATH. Windows names the variable Path.
const pathKey = Object.keys(process.env).find((key) => key.toUpperCase() === 'PATH') ?? 'PATH';
const brokenPnpm = mkdtempSync(join(tmpdir(), 'petalpost-guard-'));
after(() => rmSync(brokenPnpm, { recursive: true, force: true }));
writeFileSync(join(brokenPnpm, 'pnpm'), '#!/bin/sh\necho "pnpm failed to start" >&2\nexit 1\n');
chmodSync(join(brokenPnpm, 'pnpm'), 0o755);

test('the hook command blocks with status 2 and names pnpm when pnpm fails to start', () => {
  const guard = hookCommands.find((command) => command.includes('scripts/command-guard.js'));
  const result = spawnSync('sh', ['-c', guard], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 'git status' } }),
    encoding: 'utf8',
    env: {
      ...process.env,
      CLAUDE_PROJECT_DIR: fileURLToPath(new URL('..', import.meta.url)),
      [pathKey]: brokenPnpm + delimiter + process.env[pathKey],
    },
  });
  assert.deepEqual([result.status, /did not run: pnpm --dir/.test(result.stderr)], [2, true]);
});
