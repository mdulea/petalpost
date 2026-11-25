// Writes the link preview image of every template to public/ at linkPreviewPath: a 1200 by 630 JPEG of
// scripts/preview-card.html as Chromium renders it once the page's fonts have loaded. It starts scripts/server.js on a
// free port with an in-memory database, so it runs next to pnpm dev and the browser checks of any worktree. The server
// and the browser stop in every case. Run it after a template's art changes, and commit the images.
// Run: pnpm previews
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { TEMPLATES, linkPreviewPath } from '../public/js/templates.js';
import { startServer } from './server.js';

const server = await startServer({ port: 0, memory: true });
let browser;
try {
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  for (const { id } of TEMPLATES) {
    await page.goto(new URL(`scripts/preview-card.html?t=${id}`, server.url).href, { waitUntil: 'load' });
    await page.locator(`#card[data-ready="${id}"]`).waitFor();
    // The expression runs in the page and resolves once its fonts have loaded.
    await page.evaluate('document.fonts.ready.then(() => true)');
    const file = fileURLToPath(new URL(`../public/${linkPreviewPath(id)}`, import.meta.url));
    mkdirSync(dirname(file), { recursive: true });
    await page.locator('#card').screenshot({ path: file, type: 'jpeg', quality: 85 });
    console.log(`Wrote ${file}`);
  }
} finally {
  await browser?.close();
  await server.close();
}
