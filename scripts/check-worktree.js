// Fails when pnpm worktree add does not create branch <type>/<task> and worktree .worktrees/<type>-<task>, starts the
// branch somewhere other than the latest origin/main when local main is behind, accepts an unknown type or a task name
// that is not lowercase and hyphenated, runs while the main checkout has uncommitted changes, or when pnpm worktree
// remove leaves the worktree, an empty .worktrees directory, its local branch, its remote branch or its
// remote-tracking branch behind. Each case runs the command against a throwaway repository
// with a local bare origin and skips the dependency install.
// Run: node scripts/check-worktree.js
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

const SCRIPT = fileURLToPath(new URL('./worktree.js', import.meta.url));
const temps = [];
after(() => temps.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();

const commit = (cwd, file) => {
  writeFileSync(join(cwd, file), file);
  git(cwd, 'add', '.');
  git(cwd, 'commit', '-m', `Add ${file}`);
};

// A bare origin and a main checkout that ignores .worktrees/, as this repo does.
const setup = () => {
  const dir = mkdtempSync(join(tmpdir(), 'petalpost-worktree-'));
  temps.push(dir);
  const origin = join(dir, 'origin.git');
  const main = join(dir, 'main');
  git(dir, 'init', '-q', '--bare', '-b', 'main', origin);
  git(dir, 'clone', '-q', origin, main);
  writeFileSync(join(main, '.gitignore'), '.worktrees/\n');
  commit(main, 'README.md');
  git(main, 'push', '-q', 'origin', 'main');
  return { dir, origin, main };
};

const worktree = (cwd, ...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: 'utf8' });

test('add creates branch feat/guest-list and worktree .worktrees/feat-guest-list', () => {
  const { main } = setup();
  const result = worktree(main, 'add', 'feat', 'guest-list', '--no-install');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(join(main, '.worktrees', 'feat-guest-list'), 'branch', '--show-current'), 'feat/guest-list');
});

test('add starts the branch from the latest origin/main when local main is behind', () => {
  const { dir, origin, main } = setup();
  const other = join(dir, 'other');
  git(dir, 'clone', '-q', origin, other);
  commit(other, 'released.txt');
  git(other, 'push', '-q', 'origin', 'main');
  worktree(main, 'add', 'fix', 'late-reply', '--no-install');
  assert.equal(git(main, 'rev-parse', 'fix/late-reply'), git(other, 'rev-parse', 'HEAD'));
});

test('add rejects an unknown type', () => {
  const { main } = setup();
  const result = worktree(main, 'add', 'feature', 'guest-list', '--no-install');
  assert.deepEqual([result.status, /Unknown type "feature"/.test(result.stderr)], [1, true]);
});

test('add rejects a task name that is not lowercase and hyphenated', () => {
  const { main } = setup();
  const result = worktree(main, 'add', 'feat', 'Guest_List', '--no-install');
  assert.deepEqual([result.status, /lowercase words joined by hyphens/.test(result.stderr)], [1, true]);
});

test('add refuses while the main checkout has uncommitted changes', () => {
  const { main } = setup();
  writeFileSync(join(main, 'draft.txt'), 'draft');
  const result = worktree(main, 'add', 'docs', 'setup-guide', '--no-install');
  assert.deepEqual(
    [result.status, /uncommitted changes/.test(result.stderr), existsSync(join(main, '.worktrees'))],
    [1, true, false],
  );
});

test('remove deletes the worktree, the emptied .worktrees directory and the local branch', () => {
  const { main } = setup();
  worktree(main, 'add', 'chore', 'tidy-up', '--no-install');
  const result = worktree(main, 'remove', 'chore-tidy-up');
  assert.deepEqual(
    [result.status, existsSync(join(main, '.worktrees')), git(main, 'branch', '--list', 'chore/*')],
    [0, false, ''],
  );
});

test('remove deletes a remote branch that still exists and its remote-tracking branch', () => {
  const { origin, main } = setup();
  worktree(main, 'add', 'feat', 'guest-list', '--no-install');
  git(join(main, '.worktrees', 'feat-guest-list'), 'push', '-q', '-u', 'origin', 'HEAD');
  worktree(main, 'remove', 'feat-guest-list');
  assert.deepEqual(
    [git(origin, 'branch', '--list', 'feat/*'), git(main, 'branch', '-r', '--list', 'origin/feat/*')],
    ['', ''],
  );
});

test('remove drops the remote-tracking branch of a remote branch that GitHub already deleted', () => {
  const { origin, main } = setup();
  worktree(main, 'add', 'fix', 'late-reply', '--no-install');
  git(join(main, '.worktrees', 'fix-late-reply'), 'push', '-q', '-u', 'origin', 'HEAD');
  git(origin, 'branch', '-D', 'fix/late-reply');
  const result = worktree(main, 'remove', 'fix-late-reply');
  assert.deepEqual([result.status, git(main, 'branch', '-r', '--list', 'origin/fix/*')], [0, '']);
});
