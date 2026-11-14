// Browser checks run in Chromium against pnpm dev, which sends the same headers as production (scripts/check-site.js).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'scripts',
  testMatch: 'browser.spec.js',
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: 'http://localhost:3000/' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: { command: 'pnpm dev', url: 'http://localhost:3000/', reuseExistingServer: !process.env.CI },
});
