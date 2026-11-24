// Browser checks run against scripts/server.js with an in-memory database. It answers like production
// (tests/check-site.js), and every run starts with no invitations or replies. The port is the one browserCheckPort
// gives this checkout: the port that PORT_ENV names, 4321 in the main checkout and CI, and a port of its own,
// derived from the root path, in each linked worktree. Tests open paths, never a local origin, and lint enforces it.
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import { browserCheckPort } from './scripts/browser-port.js';

const port = browserCheckPort(fileURLToPath(new URL('.', import.meta.url)));

export default defineConfig({
  testDir: 'tests',
  // Inside node_modules/, which every tool already ignores, so no ignore list in any commit has to name it.
  outputDir: 'node_modules/.cache/playwright',
  testMatch: '*.spec.js',
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: `http://localhost:${port}/` },
  // WebKit is Safari's engine, which sizes date, time and other native controls differently from Chromium.
  // Linux WebKit resizes about ten times slower than Chromium. With two workers, a viewport sweep takes up to 36
  // seconds there, so the default 30-second timeout fails it. WebKit runs the layout suite and every test tagged
  // @webkit; grep matches the file name and the tags in each test's title path.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'webkit',
      grep: [/layout\.spec\.js/, /@webkit/],
      timeout: 120000,
      use: { ...devices['iPhone 15'] },
    },
  ],
  // A port of its own and no reuse: another program on the port, such as another worktree's server, fails the run
  // instead of being tested in place of scripts/server.js. With no url, Playwright skips its own port probe, so
  // scripts/server.js refuses the port with a message that names PORT_ENV, and its start line with the port marks it
  // ready.
  webServer: {
    command: `node scripts/server.js --port ${port} --memory --daily-events 200`,
    wait: { stdout: new RegExp(`Petalpost at http://localhost:${port}/`) },
  },
});
