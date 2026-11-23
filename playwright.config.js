// Browser checks run against scripts/server.js on port 4321 with an in-memory database. It answers like production
// (scripts/check-site.js), and every run starts with no invitations or replies.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'scripts',
  testMatch: '*.spec.js',
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4321/' },
  // WebKit is Safari's engine, which sizes date, time and other native controls differently from Chromium.
  // Linux WebKit resizes about ten times slower than Chromium. With two workers, a viewport sweep takes up to 36
  // seconds there, so the default 30-second timeout fails it.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', testMatch: 'layout.spec.js', timeout: 120000, use: { ...devices['iPhone 15'] } },
  ],
  // A port of its own and no reuse: another server on the port, such as an editor preview, fails the run instead of
  // being tested in place of scripts/server.js.
  webServer: {
    command: 'node scripts/server.js --port 4321 --memory --daily-events 200',
    url: 'http://localhost:4321/',
    reuseExistingServer: false,
  },
});
