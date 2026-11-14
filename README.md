# Petalpost

Petalpost is a website where anyone can design an invitation in the browser and share it.
This README tells developers how to install, run, test, deploy and contribute to it.

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

With `pnpm dev` running:

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
  - `browser.spec.js` and `layout.spec.js` hold the browser tests that `pnpm test:browser` runs. `layout.spec.js` checks alignment, target sizes and that the Preview button never covers the focused field. It runs at both sides of every width breakpoint in `css/styles.css` and at common phone, tablet and desktop sizes up to 4K.
  - `og-card.html` and `og-card.js` generate `og-image.png`.
- `.github/workflows/checks.yml` runs every check on each push and pull request. It is disabled in GitHub because the account has no Actions minutes; `gh workflow enable Checks` turns it back on.
- `docs/petalpost-flow.html` is a diagram of the site flow.

## Development

| Task           | Command                                  |
| -------------- | ---------------------------------------- |
| Test suite     | `pnpm test`                              |
| One check file | `pnpm exec node scripts/check-invite.js` |
| Lint           | `pnpm lint`                              |
| Format         | `pnpm format`                            |
| Format check   | `pnpm format:check`                      |
| Type check     | `pnpm typecheck`                         |
| Browser tests  | `pnpm test:browser`                      |

To run another check file, replace `check-invite.js` with any `scripts/check-*.js` file.

`test` runs the Prettier format check, ESLint and the contrast, invite and site checks in `scripts/` with the Node.js test runner.
It does not run the type check or the browser tests.

`test:browser` starts `serve` on port 4321 and runs the Playwright tests in Chromium. It runs the layout tests in WebKit too, because Safari sizes date and time inputs differently.
Before the first run, install the browsers with `pnpm exec playwright install chromium webkit`.
The run fails when another program already uses port 4321.
The tests fail when a page breaks the Content-Security-Policy.

### Tooling notes

- `.gitattributes` forces LF line endings. A CRLF checkout makes `pnpm format:check` fail on every file and makes the vendored library hash check fail.
- pnpm refuses package releases younger than its minimum release age. When you upgrade a dependency, pick a release older than that age.
- `pnpm-workspace.yaml` denies the esbuild build script. Without that entry, pnpm 12 fails the install with `ERR_PNPM_IGNORED_BUILDS`.

## Deployment

Vercel's GitHub integration deploys every push to `main` to production.
No check holds a deployment back.
Run `pnpm test`, `pnpm typecheck` and `pnpm test:browser` locally before you push `main`.
After you enable the workflow, you can add a Vercel Deployment Check on the `checks` job, which holds production until the GitHub checks pass.
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
The check compares the address only on the three pages whose robots tag allows indexing, so check `404.html` by hand.

If the production domain changes, update the canonical and Open Graph URLs in the pages, `robots.txt` and `sitemap.xml`.
Then run `pnpm exec node scripts/check-site.js` to find any copy you missed.

`og-image.png` is the 1200 by 630 link preview.
To regenerate it:

1. Run `pnpm dev`.
2. Open `http://localhost:3000/scripts/og-card.html`.
3. Click "Save og-image.png".
4. Move the downloaded file to the repository root and commit it.

## Contributing

1. Branch from `main`.
2. Make the change and add tests to the checks in `scripts/`.
3. Run `pnpm test`, `pnpm typecheck` and `pnpm test:browser`.
4. Describe what the branch changes and why.

Agents: [AGENTS.md](AGENTS.md).
