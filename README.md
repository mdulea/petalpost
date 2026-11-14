# Petalpost

Petalpost is a website where anyone can design an invitation in the browser and share it.

## Overview

A visitor chooses a template and adds a photo, names, a date and an address.
The editor then downloads the invitation as a PNG or copies a share link.
The site is static HTML, CSS and JavaScript with no build step and no backend.
It runs at `https://petalpost-beryl.vercel.app`.

## Quick start

### Prerequisites

- pnpm 12.18.0 on your PATH, installed standalone or through `corepack enable pnpm`.

`package.json` pins pnpm 12.18.0 in `packageManager`.
`devEngines.runtime` pins Node.js 26.13.1, and pnpm installs it into `node_modules/.bin`.
Every `pnpm` script runs on the pinned Node.js, whatever version is installed globally.

### Installation

```bash
git clone https://github.com/mdulea/petalpost.git
cd petalpost
pnpm install
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

The last command makes `git blame` skip the commit that first formatted the project with Prettier.

### Run

```bash
pnpm dev
```

The site is served at `http://localhost:3000`.
Opening the HTML files directly does not work, because browsers refuse ES modules loaded from the file system.

## Usage

1. Open `http://localhost:3000` and choose a template.
2. In the editor, add a photo, names, a date and an address, and pick an accent color.
3. Click "Download PNG" to save the invitation as an image, or "Copy share link" to send it as a link.

A share link carries the text, the template and the color, but not the photo.
The editor keeps the draft and photo in the browser's local storage, so a reload restores them.

## Project structure

- `index.html` is the landing page, `editor.html` is the editor, and `privacy.html` and `404.html` are the remaining pages.
- `js/` holds the page scripts:
  - `templates.js` is the template catalog and the `renderInvite` renderer.
  - `invite.js` handles invite records, share links, the storage policy and the calendar file. It has no DOM access, so the Node checks import it.
  - `mount.js` puts rendered invites into the page and fits their text. It runs only in the browser.
  - `editor.js` and `landing.js` are the entry modules of the editor and the landing page.
  - `icons.js` injects the inline SVG sprite.
  - `analytics.js` is a classic script that sets up the Vercel Web Analytics queue.
  - `globals.d.ts` declares the types of the `htmlToImage` and analytics globals.
- `css/` holds the styles, and `fonts/` holds the self-hosted fonts.
- `vendor/html-to-image.js` is html-to-image 1.11.11, the library that renders the PNG. Its license is in `THIRD_PARTY_NOTICES.txt`.
- `scripts/` holds the checks and the link preview generator:
  - `check-*.js` are the Node checks that `pnpm test` runs. The header comment of each file lists what it checks.
  - `browser.spec.js` holds the browser tests that `pnpm test:browser` runs.
  - `og-card.html` and `og-card.js` generate `og-image.png`.
- `.github/workflows/checks.yml` runs every check on each push and pull request. It is disabled in GitHub because the account has no Actions minutes; `gh workflow enable Checks` turns it back on.
- `docs/petalpost-flow.html` is a diagram of the site flow.

## Development

| Task            | Command                                  |
| --------------- | ---------------------------------------- |
| Test (all)      | `pnpm test`                              |
| Test (one file) | `pnpm exec node scripts/check-invite.js` |
| Lint            | `pnpm lint`                              |
| Format          | `pnpm format`                            |
| Format check    | `pnpm format:check`                      |
| Type check      | `pnpm typecheck`                         |
| Browser tests   | `pnpm test:browser`                      |

The one-file command works for each `scripts/check-*.js`.

`test` runs the Prettier format check, ESLint and the contrast, invite and site checks in `scripts/` with the Node.js test runner.
It does not run the type check or the browser tests.

`test:browser` starts `pnpm dev` and runs the Playwright tests in Chromium.
Install Chromium once with `pnpm exec playwright install chromium`.
The tests fail when a page breaks the Content-Security-Policy.

### Tooling notes

- `.gitattributes` forces LF line endings. A CRLF checkout makes `pnpm format:check` fail on every file and makes the vendored library hash check fail.
- pnpm refuses package releases younger than its minimum release age. When you upgrade a dependency, pick a release older than that age.
- `pnpm-workspace.yaml` denies the esbuild build script. Without that entry, pnpm 12 fails the install with `ERR_PNPM_IGNORED_BUILDS`.

## Deployment

Vercel's GitHub integration deploys every push to `main` to production.
No check holds a deployment back, so run every check locally before pushing `main`.
With the workflow enabled, a Vercel Deployment Check on the `checks` job can hold production until the GitHub checks pass.
Pushes to other branches get preview deployments.
Vercel serves the repository root as static files, with no install or build step.
`.vercelignore` keeps package files, tooling, `scripts/` and documentation out of the deployment.
The Vercel CLI is a dev dependency, so run it as `pnpm exec vercel`.

`vercel.json` sends a Content-Security-Policy and other security headers on every path.
`serve.json` sends the same headers locally, and `check-site.js` fails when the two differ.

All four pages load Vercel Web Analytics.
Enable Web Analytics in the Vercel project dashboard before deploying.

The footer contact link uses the placeholder `hello@example.com`.
Replace it in all four pages before launch, then run `pnpm exec node scripts/check-site.js`.
The check compares the address on the three indexed pages only, so check `404.html` by hand.

If the production domain changes, update the canonical and Open Graph URLs in the pages, `robots.txt` and `sitemap.xml`.
Then run `pnpm exec node scripts/check-site.js` to find any copy you missed.

`og-image.png` is the 1200 by 630 link preview.
To regenerate it, run `pnpm dev`, open `http://localhost:3000/scripts/og-card.html` and click "Save og-image.png".
Move the downloaded file to the repository root and commit it.

## Contributing

1. Branch from `main`.
2. Make the change and add tests to the checks in `scripts/`.
3. Run `pnpm test`, `pnpm typecheck` and `pnpm test:browser`.
4. Describe what the branch changes and why.

Agents: [AGENTS.md](AGENTS.md).
