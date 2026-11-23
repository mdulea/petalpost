// Creates and removes task worktrees under .worktrees/ in the main checkout.
// `add <type> <task>` refuses an unknown type, a task name that is not lowercase and hyphenated, or a main checkout
// with uncommitted changes. It then fetches origin, creates branch <type>/<task> from origin/main without tracking it,
// adds the worktree .worktrees/<type>-<task>, and installs dependencies from the main checkout's .pnpm-store.
// `--no-install` skips the install.
// `remove <type>-<task>` removes the worktree and force-deletes its local branch, because a squash merge leaves the
// branch unmerged. git refuses to remove a worktree with uncommitted changes. The remote branch is left alone,
// because GitHub deletes it on merge.
// Run: pnpm worktree add <type> <task> [--no-install] | pnpm worktree remove <type>-<task>
import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';

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
  gitOrExit(mainCheckout, 'worktree', 'remove', join(mainCheckout, '.worktrees', `${type}-${task}`));
  gitOrExit(mainCheckout, 'branch', '-D', `${type}/${task}`);
} else {
  fail(USAGE);
}
