// Browser checks run against scripts/server.js on port 4321, or the port that PORT_ENV names, with an in-memory
// database. It answers like production (tests/check-site.js), and every run starts with no invitations or replies.
import { defineConfig, devices } from '@playwright/test';
import { PORT_ENV } from './scripts/server.js';

const port = Number(process.env[PORT_ENV] || 4321);

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
  // seconds there, so the default 30-second timeout fails it.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', testMatch: 'layout.spec.js', timeout: 120000, use: { ...devices['iPhone 15'] } },
  ],
  // A port of its own and no reuse: another program on the port, such as another worktree's server, fails the run
  // instead of being tested in place of scripts/server.js. With no url, Playwright skips its own port probe, so
  // scripts/server.js refuses the port with a message that names PORT_ENV, and the start line marks it ready.
  webServer: {
    command: `node scripts/server.js --port ${port} --memory --daily-events 200`,
    wait: { stdout: /Petalpost at / },
  },
});
