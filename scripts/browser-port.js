// The port that the browser checks run scripts/server.js on, one per checkout, so worktrees run their checks at the
// same time. playwright.config.js reads it, and scripts/server.js names PORT_ENV when another program holds the port.
import { createHash } from 'node:crypto';
import { statSync } from 'node:fs';
import { join, resolve } from 'node:path';

// The environment variable that sets the browser-check port. It wins over the port that browserCheckPort derives.
export const PORT_ENV = 'BROWSER_CHECK_PORT';

// The browser-check port of the main checkout, and so of CI, which runs in a fresh clone.
export const DEFAULT_PORT = 4321;

// The browser-check ports of linked worktrees. The range holds neither DEFAULT_PORT nor the pnpm dev port 3000.
export const WORKTREE_PORTS = { first: 4400, last: 4999 };

// The browser-check port of the checkout at root. It is PORT_ENV when env sets it, and it throws when PORT_ENV is not
// a port number. A linked worktree's .git is a file, and it gets a port in WORKTREE_PORTS hashed from the root path,
// so it gets the same port on every run, and two worktrees share a port with a chance of 1 in 600. Any other root,
// such as the main checkout, whose .git is a directory, or a copy without .git, gets DEFAULT_PORT. Windows paths
// ignore case, so the hash does too.
export function browserCheckPort(root, env = process.env) {
  if (env[PORT_ENV]) {
    const port = Number(env[PORT_ENV]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`${PORT_ENV} must be a port number from 1 to 65535, not "${env[PORT_ENV]}".`);
    }
    return port;
  }
  if (!statSync(join(root, '.git'), { throwIfNoEntry: false })?.isFile()) return DEFAULT_PORT;
  const path = process.platform === 'win32' ? resolve(root).toLowerCase() : resolve(root);
  const hash = createHash('sha256').update(path).digest().readUInt32BE(0);
  return WORKTREE_PORTS.first + (hash % (WORKTREE_PORTS.last - WORKTREE_PORTS.first + 1));
}
