// Builds the static site that Vercel serves. buildSite(outDir) replaces outDir with a copy of public/, which holds
// the site files only. Package files, server code, migrations, tooling and documentation live outside public/, so no
// URL can serve them.
// Run: pnpm build, which writes dist/.
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The site files, laid out as their URLs.
export const SITE = fileURLToPath(new URL('../public/', import.meta.url));

/** @param {string} outDir */
export function buildSite(outDir) {
  rmSync(outDir, { recursive: true, force: true });
  cpSync(SITE, outDir, { recursive: true });
}

if (import.meta.main) buildSite(fileURLToPath(new URL('../dist/', import.meta.url)));
