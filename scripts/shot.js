// Writes a PNG of one page, or of the first element that a CSS selector matches on it, as Chromium renders it at
// 1280 by 720. It starts scripts/server.js on a free port with an in-memory database, so it runs next to pnpm dev and
// the browser checks of any worktree, and it opens the path once the page's fonts have loaded. Without a selector it
// writes the full page. A selector that matches nothing writes no file, prints a message naming the selector and the
// path, and exits with status 1. The server and the browser stop in every case.
// The path resolves against the site root with or without its leading /, and a path that leaves the site exits with
// status 1 before the server starts.
// Run: pnpm shot <path> [<selector>] <file>, such as pnpm shot ro/ .gallery gallery.png
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { startServer } from './server.js';

const USAGE = 'Usage: pnpm shot <path> [<selector>] <file>, such as pnpm shot editor.html "#previewCard" card.png';

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const args = process.argv.slice(2);
if (args.length < 2 || args.length > 3) fail(USAGE);
const [path, selector, file] = args.length === 3 ? args : [args[0], undefined, args[1]];
// Git Bash rewrites an argument that starts with / into a Windows path, such as C:/Program Files/Git/editor.html,
// which resolves to another origin. A path without the leading / resolves against the site root too.
if (new URL(path, 'http://localhost/').origin !== 'http://localhost') {
  fail(`${path} is not a path on the site. Write it without the leading /, such as editor.html or ro/.`);
}

const server = await startServer({ port: 0, memory: true });
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(new URL(path, server.url).href, { waitUntil: 'load' });
  // The expression runs in the page and resolves once its fonts have loaded.
  await page.evaluate('document.fonts.ready.then(() => true)');
  if (!selector) {
    await page.screenshot({ path: file, fullPage: true });
  } else if ((await page.locator(selector).count()) === 0) {
    console.error(`No element on ${path} matches ${selector}. No file was written.`);
    process.exitCode = 1;
  } else {
    await page.locator(selector).first().screenshot({ path: file });
  }
  if (!process.exitCode) console.log(`Wrote ${resolve(file)}`);
} finally {
  await browser?.close();
  await server.close();
}
