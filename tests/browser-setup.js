// The shared setup of the browser tests. playwright.config.js starts scripts/server.js with an in-memory database
// for the whole run, and a spec file imports these helpers, so a new spec file starts from the same setup.
import { expect } from '@playwright/test';

// Policy violations and uncaught errors. The Vercel analytics script only exists in production, so its 404 is not one.
export function watch(page) {
  const problems = [];
  page.on('console', (message) => {
    if (/Content Security Policy/i.test(message.text())) problems.push(message.text());
  });
  page.on('pageerror', (error) => problems.push(error.message));
  return problems;
}

// A page in a browser context of its own, as on another device. options are Playwright context options.
export async function newBrowser(browser, options = {}) {
  const page = await (await browser.newContext(options)).newPage();
  return { page, problems: watch(page) };
}

// Publishes a birthday invitation with the title and returns the links the editor shows.
export async function publish(page, title) {
  await page.goto('editor.html?t=birthday');
  await page.fill('#title', title);
  await page.click('#publish');
  await expect(page.locator('#eventLink')).toHaveValue(/\/e\/[A-Za-z0-9_-]{22}$/);
  return {
    invitation: await page.locator('#eventLink').inputValue(),
    manage: await page.locator('#manageLink').inputValue(),
  };
}
