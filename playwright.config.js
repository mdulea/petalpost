// Browser checks run against serve on port 4321, which sends the same headers as production (scripts/check-site.js).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'scripts',
  testMatch: '*.spec.js',
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4321/' },
  // WebKit is Safari's engine, which sizes date, time and other native controls differently from Chromium.
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', testMatch: 'layout.spec.js', use: { ...devices['iPhone 15'] } },
  ],
  // A port of its own and no reuse: another server on the port, such as an editor preview, fails the run instead of
  // being tested in place of serve.
  webServer: {
    command: 'pnpm exec serve --listen 4321 --no-clipboard',
    url: 'http://localhost:4321/',
    reuseExistingServer: false,
  },
});
