// Creates and removes task worktrees under .worktrees/ in the main checkout.
// `add <type> <task>` refuses an unknown type, a task name that is not lowercase and hyphenated, or a main checkout
// with uncommitted changes. It then fetches origin, creates branch <type>/<task> from origin/main without tracking it,
// adds the worktree .worktrees/<type>-<task>, and installs dependencies from the main checkout's .pnpm-store.
// `--no-install` skips the install.
// `remove <type>-<task>` removes the worktree, then .worktrees/ once it is empty, and force-deletes the local branch,
// because a squash merge leaves the branch unmerged. git refuses to remove a worktree with uncommitted changes. It then
// prunes the remote-tracking branches whose remote branch is gone, as after GitHub deletes a merged branch, and deletes
// the remote branch when it still exists. It runs from the main checkout, so its own process never holds the folder.
// When git unregisters the worktree but cannot delete its folder, as Windows refuses while a shell or another process
// uses the folder, remove retries the deletion and then finishes the cleanup. A folder that stays undeletable is named,
// and remove exits with status 1 after the other steps.
// Run: pnpm worktree add <type> <task> [--no-install] | pnpm worktree remove <type>-<task>
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, rmdirSync, rmSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const TYPES = ['feat', 'fix', 'docs', 'refactor', 'test', 'chore'];
const TASK = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const USAGE = 'Usage: pnpm worktree add <type> <task> [--no-install] | pnpm worktree remove <type>-<task>';

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

// Runs git with its output shown and exits with git's status when it fails.
const gitOrExit = (cwd, ...args) => {
  const { status } = spawnSync('git', args, { cwd, stdio: 'inherit' });
  if (status !== 0) process.exit(status ?? 1);
};

// Whether git still lists the worktree at path. git prints forward slashes on Windows, and relative() ignores that and
// the letter case of Windows paths.
const registered = (path) =>
  git(mainCheckout, 'worktree', 'list', '--porcelain')
    .split('\n')
    .filter((line) => line.startsWith('worktree '))
    .some((line) => relative(line.slice('worktree '.length), path) === '');

const DELETE_ATTEMPTS = 5;

// Deletes the folder at path, waiting half a second after each failed attempt, and reports whether it is gone.
const deleteFolder = (path) => {
  for (let attempt = 1; attempt <= DELETE_ATTEMPTS; attempt++) {
    console.error(`Deleting ${path} again, attempt ${attempt} of ${DELETE_ATTEMPTS}.`);
    try {
      rmSync(path, { recursive: true, force: true });
      return true;
    } catch {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
  }
  return false;
};

const validate = (type, task) => {
  if (!TYPES.includes(type)) fail(`Unknown type "${type}". Use one of: ${TYPES.join(', ')}.`);
  if (!TASK.test(task ?? '')) fail(`Task name "${task ?? ''}" must be lowercase words joined by hyphens.`);
};

// The main checkout is the parent of the shared .git directory, so the command works from any worktree.
const mainCheckout = dirname(git(process.cwd(), 'rev-parse', '--path-format=absolute', '--git-common-dir').trim());

const [command, ...args] = process.argv.slice(2);

if (command === 'add') {
  const install = !args.includes('--no-install');
  const [type, task] = args.filter((arg) => arg !== '--no-install');
  validate(type, task);
  if (git(mainCheckout, 'status', '--porcelain').trim()) {
    fail(`The main checkout ${mainCheckout} has uncommitted changes. Commit or stash them first.`);
  }
  const path = join(mainCheckout, '.worktrees', `${type}-${task}`);
  gitOrExit(mainCheckout, 'fetch', 'origin');
  gitOrExit(mainCheckout, 'worktree', 'add', '--no-track', '-b', `${type}/${task}`, path, 'origin/main');
  if (install) {
    // pnpm sets npm_execpath to its own executable or JavaScript entry, which runs without a shell on every platform.
    const pnpm = process.env.npm_execpath;
    if (!pnpm) fail(`The worktree ${path} exists, but no pnpm ran this command. Run pnpm install there.`);
    const [file, ...prefix] = /\.[cm]?js$/.test(pnpm) ? [process.execPath, pnpm] : [pnpm];
    const installArgs = ['install', '--frozen-lockfile', '--store-dir', join(mainCheckout, '.pnpm-store')];
    const { status } = spawnSync(file, [...prefix, ...installArgs], { cwd: path, stdio: 'inherit' });
    if (status !== 0) fail(`The worktree ${path} exists, but pnpm install failed.`);
  }
  console.log(`Worktree ready: ${path}`);
} else if (command === 'remove') {
  const [, type, task] = (args[0] ?? '').match(/^([^-]*)-(.*)$/) ?? [];
  validate(type ?? '', task);
  const branch = `${type}/${task}`;
  const worktrees = join(mainCheckout, '.worktrees');
  const path = join(worktrees, `${type}-${task}`);
  process.chdir(mainCheckout);
  // Git for Windows asks whether to retry a failed deletion when stdin is a terminal, so git gets no stdin.
  const { status } = spawnSync('git', ['worktree', 'remove', path], {
    cwd: mainCheckout,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  // Any other failure, such as uncommitted changes or an unknown worktree, stops before the branches are touched.
  if (status !== 0 && (!existsSync(path) || registered(path))) process.exit(status ?? 1);
  const leftover = existsSync(path) && !deleteFolder(path);
  if (!leftover && readdirSync(worktrees).length === 0) rmdirSync(worktrees);
  gitOrExit(mainCheckout, 'branch', '-D', branch);
  gitOrExit(mainCheckout, 'fetch', '--prune', 'origin');
  if (git(mainCheckout, 'ls-remote', '--heads', 'origin', branch).trim()) {
    gitOrExit(mainCheckout, 'push', 'origin', '--delete', branch);
  }
  if (leftover)
    fail(`The folder ${path} could not be deleted. Close the shells and programs that use it, then delete it.`);
} else {
  fail(USAGE);
}
