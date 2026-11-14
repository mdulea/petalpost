// Builds the static site that Vercel serves. buildSite(outDir) replaces outDir with copies of the site files only.
// Package files, server code, migrations, tooling and documentation stay out, so no URL can serve them.
// Run: pnpm build, which writes dist/.
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

// The allowlist. A new kind of site file needs an entry here, and check-site.js fails until it has one.
const ROOT_FILE = /^(.+\.(html|png|svg)|robots\.txt|sitemap\.xml|THIRD_PARTY_NOTICES\.txt)$/;
const DIRECTORIES = { css: () => true, fonts: () => true, vendor: () => true, js: (file) => file.endsWith('.js') };

// Whether a path relative to the repository root, with / separators, is a site file that buildSite copies.
/** @param {string} path */
export function isSiteFile(path) {
  const [first, ...rest] = path.split('/');
  if (!rest.length) return ROOT_FILE.test(first);
  return Object.hasOwn(DIRECTORIES, first) && DIRECTORIES[first](rest.join('/'));
}

/** @param {string} outDir */
export function buildSite(outDir) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  for (const file of readdirSync(root).filter((name) => ROOT_FILE.test(name))) {
    cpSync(join(root, file), join(outDir, file));
  }
  for (const [dir, include] of Object.entries(DIRECTORIES)) {
    for (const file of readdirSync(join(root, dir), { recursive: true, encoding: 'utf8' }).filter(include)) {
      cpSync(join(root, dir, file), join(outDir, dir, file));
    }
  }
}

if (import.meta.main) buildSite(join(root, 'dist'));
