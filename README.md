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
- `js/` holds the page scripts: `templates.js` is the template catalog and renderer, and `invite.js` handles invite records, share links and the calendar file.
- `css/` holds the styles, and `fonts/` holds the self-hosted fonts.
- `vendor/html-to-image.js` is the library that renders the PNG.
- `scripts/` holds the checks that `pnpm test` runs and `og-card.html`, which generates the link preview image.
- `docs/petalpost-flow.html` is a diagram of the site flow.

## Development

```bash
pnpm test
pnpm lint
pnpm format
pnpm typecheck
```

`test` runs the Prettier format check, ESLint and the contrast, invite and site checks in `scripts/`.
It does not run the type check.

## Deployment

Vercel's GitHub integration deploys every push to `main` to production.
Pushes to other branches get preview deployments.
Vercel serves the repository root as static files, with no install or build step.
`.vercelignore` keeps package files, tooling, `scripts/` and documentation out of the deployment.
The Vercel CLI is a dev dependency, so run it as `pnpm exec vercel`.

All four pages load Vercel Web Analytics.
Enable Web Analytics in the Vercel project dashboard before deploying.

The footer contact link uses the placeholder `hello@example.com`.
Replace it in all four pages before launch, then run `pnpm exec node scripts/check-site.js`.

If the production domain changes, update the canonical and Open Graph URLs in the pages, `robots.txt` and `sitemap.xml`.
Then run `pnpm exec node scripts/check-site.js` to find any copy you missed.

`og-image.png` is the 1200 by 630 link preview.
To regenerate it, run `pnpm dev`, open `http://localhost:3000/scripts/og-card.html` and click "Save og-image.png".
Move the downloaded file to the repository root and commit it.

## Contributing

1. Branch from `main`.
2. Make the change and add tests to the checks in `scripts/`.
3. Run `pnpm test` and `pnpm typecheck`.
4. Describe what the branch changes and why.

Agents: [AGENTS.md](AGENTS.md).
