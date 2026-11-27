// Fails when pnpm worktree add does not create branch <type>/<task> and worktree .worktrees/<type>-<task>, starts the
// branch somewhere other than the latest origin/main when local main is behind, accepts an unknown type or a task name
// that is not lowercase and hyphenated, runs while the main checkout has uncommitted changes, or when pnpm worktree
// remove leaves the worktree, an empty .worktrees directory, its local branch, its remote branch or its
// remote-tracking branch behind, or when a worktree folder that cannot be deleted at first makes remove skip a later
// step, or one that stays undeletable goes unnamed or leaves remove exiting with status 0. Each case runs the command
// against a throwaway repository with a local bare origin and skips the dependency install. Fails too when a GIT_DIR
// inherited from a git hook or git rebase --exec redirects these git calls away from the throwaway repository.
// Run: pnpm exec node tests/check-worktree.js
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, test } from 'node:test';

const SCRIPT = fileURLToPath(new URL('../scripts/worktree.js', import.meta.url));
const temps = [];
after(() => temps.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

// A git hook or git rebase --exec sets GIT_DIR and GIT_INDEX_FILE, which would point every git call here at the
// repository running the checks. Dropping every GIT_ variable keeps the calls on the throwaway repository.
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')));

const git = (cwd, ...args) =>
  execFileSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], {
    cwd,
    env,
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

const worktree = (cwd, ...args) => spawnSync(process.execPath, [SCRIPT, ...args], { cwd, env, encoding: 'utf8' });

test('add creates branch feat/guest-list and worktree .worktrees/feat-guest-list', () => {
  const { main } = setup();
  const result = worktree(main, 'add', 'feat', 'guest-list', '--no-install');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(git(join(main, '.worktrees', 'feat-guest-list'), 'branch', '--show-current'), 'feat/guest-list');
});

test('the checks leave the repository named by an inherited GIT_DIR untouched', () => {
  const { main: decoy } = setup();
  const before = git(decoy, 'rev-parse', 'HEAD');
  const result = spawnSync(
    process.execPath,
    ['--test', '--test-name-pattern=^add creates branch', fileURLToPath(import.meta.url)],
    // NODE_TEST_CONTEXT would make the nested run report to this one instead of exiting with its own status.
    { env: { ...env, NODE_TEST_CONTEXT: undefined, GIT_DIR: join(decoy, '.git') }, encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.deepEqual([git(decoy, 'rev-parse', 'HEAD'), git(decoy, 'status', '--porcelain')], [before, '']);
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

// Windows refuses to delete a folder that a process uses as its current directory, as a shell left in a worktree does.
// POSIX systems refuse to delete a folder whose parent is read-only. Both leave git unable to delete the folder after
// it has deleted the files. The returned function releases the folder.
const lockFolder = (folder) => {
  if (process.platform === 'win32') {
    const holder = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { cwd: folder, stdio: 'ignore' });
    return () =>
      /** @type {Promise<void>} */ (
        new Promise((resolve) => (holder.exitCode === null ? holder.once('exit', () => resolve()).kill() : resolve()))
      );
  }
  chmodSync(join(folder, '..'), 0o555);
  return async () => chmodSync(join(folder, '..'), 0o755);
};

// Runs remove while the worktree folder is locked. With release set, the folder is released once remove reports its
// first retry of the deletion.
const removeLocked = (main, name, { release }) =>
  new Promise((resolve) => {
    const unlock = lockFolder(join(main, '.worktrees', name));
    const child = spawn(process.execPath, [SCRIPT, 'remove', name], { cwd: main, env });
    let stderr = '';
    let released;
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      if (release && !released && /Deleting .* again/.test(stderr)) released = unlock();
    });
    child.on('close', async (status) => {
      await (released ?? unlock());
      resolve({ status, stderr });
    });
  });

test('remove retries the deletion of a worktree folder that is locked at first and finishes the cleanup', async () => {
  const { origin, main } = setup();
  worktree(main, 'add', 'fix', 'locked-folder', '--no-install');
  git(join(main, '.worktrees', 'fix-locked-folder'), 'push', '-q', '-u', 'origin', 'HEAD');
  const result = await removeLocked(main, 'fix-locked-folder', { release: true });
  assert.deepEqual(
    [
      result.status,
      existsSync(join(main, '.worktrees')),
      git(main, 'branch', '--list', 'fix/*'),
      git(origin, 'branch', '--list', 'fix/*'),
    ],
    [0, false, '', ''],
    result.stderr,
  );
});

test('remove names a worktree folder that stays locked and exits with status 1 after the other cleanup', async () => {
  const { origin, main } = setup();
  worktree(main, 'add', 'fix', 'stuck-folder', '--no-install');
  git(join(main, '.worktrees', 'fix-stuck-folder'), 'push', '-q', '-u', 'origin', 'HEAD');
  const result = await removeLocked(main, 'fix-stuck-folder', { release: false });
  assert.deepEqual(
    [
      result.status,
      result.stderr.includes(join(main, '.worktrees', 'fix-stuck-folder')),
      git(main, 'branch', '--list', 'fix/*'),
      git(origin, 'branch', '--list', 'fix/*'),
      git(main, 'worktree', 'list').split('\n').length,
    ],
    [1, true, '', '', 1],
    result.stderr,
  );
});
