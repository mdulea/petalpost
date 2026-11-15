# Petalpost

Petalpost is a website where anyone can design an invitation in the browser and share it.
This README tells developers how to install, run, test, deploy and contribute to it.

## Overview

A visitor chooses a template and adds a photo, names, a date and an address.
The editor then downloads the invitation as a PNG or copies a share link.
A host can also publish the invitation to collect replies.
Guests reply from the invitation link, and the host sees the replies and totals on a private management page.
The pages are static HTML, CSS and JavaScript.
API functions on the same origin store published invitations and replies in Neon Postgres.
It runs at `https://www.petalpost.ro`.

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
`scripts/server.js` serves the files and answers the `/api/` paths from a PGlite database in `.pglite/`, so local replies never reach Neon.
Delete `.pglite/` to start with no invitations.
Opening the HTML files directly does not work, because browsers refuse ES modules loaded from the file system.

## Usage

With `pnpm dev` running:

1. Open `http://localhost:3000` and choose a template.
2. In the editor, add a photo, names, a date and an address, and pick an accent color.
3. Click "Download PNG" to save the invitation as an image, or "Copy share link" to send it as a link.

4. Click "Publish" to store the invitation and get an invitation link and a management link.
5. Open the invitation link in another browser and send a reply.
6. Open the management link to see the replies and totals, or to delete the invitation.

A share link carries the text, the template and the color, but not the photo.
Publishing stores the same fields on the server, and the photo stays in the browser too.
The editor keeps the draft, the photo and the published invitation's management secret in the browser's local storage, so a reload restores them.
A lost management link cannot be recovered.

## Project structure

- `index.html` is the landing page, `editor.html` is the editor and the guest view, and `manage.html` is the host's management page.
- `birthday-invitations.html` and the five other `*-invitations.html` pages show one occasion's templates and advice. `pnpm pages` generates them; do not edit them by hand.
- `invitation-wording.html` and `when-to-send-invitations.html` are the guides, and `about.html`, `privacy.html`, `terms.html` and `404.html` are the remaining pages.
- `js/` holds the page scripts:
  - `templates.js` is the template catalog and the `renderInvite` renderer.
  - `invite.js` handles invite records, share links, the storage policy and the calendar file. It has no DOM access, so the Node checks import it.
  - `rsvp.js` validates replies, builds and reads private links, and is the API client. It has no DOM access, so the server and the Node checks import it.
  - `mount.js` puts rendered invites into the page and fits their text. It runs only in the browser.
  - `editor.js`, `manage.js` and `landing.js` are the entry modules of the editor, the management page and the landing page. `page.js` is the entry module of the occasion pages, the guides and the About page.
  - `icons.js` injects the inline SVG sprite.
  - `analytics.js` is a classic script that sets up the Vercel Web Analytics queue.
  - `globals.d.ts` declares the types of the `htmlToImage` and analytics globals.
- `css/` holds the styles, and `fonts/` holds the self-hosted fonts.
- `api/index.js` is the Vercel Function for every `/api/` path. `server/api.js` routes, validates and stores the requests, `server/postgres.js` connects to Postgres, and `server/migrate.js` applies the SQL files in `migrations/`.
- `vendor/html-to-image.js` is html-to-image 1.11.11, the library that renders the PNG. Its license is in `THIRD_PARTY_NOTICES.txt`.
- `scripts/` holds the local server, the build, the checks and the link preview generator:
  - `server.js` is the local server for `pnpm dev` and the browser tests.
  - `build.js` copies the site files into `dist/`, which Vercel serves.
  - `pages.js` generates the HTML that search engines must read without running JavaScript: the occasion pages, the landing gallery and occasion links, and every page footer. It fills the regions between `<!-- generated:NAME -->` markers. `occasions.js` holds the text of the occasion pages.
  - `check-*.js` are the Node checks that `pnpm test` runs. The header comment of each file lists what it checks.
  - `browser.spec.js`, `rsvp.spec.js` and `layout.spec.js` hold the browser tests that `pnpm test:browser` runs. `rsvp.spec.js` publishes, replies and manages invitations through the real API, with a separate browser for the host and each guest. `layout.spec.js` checks alignment, target sizes and that the Preview button never covers the focused field. It runs at both sides of every width breakpoint in `css/styles.css` and at common phone, tablet and desktop sizes up to 4K.
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
| Site build     | `pnpm build`                             |
| Generate pages | `pnpm pages`                             |
| Migrations     | `pnpm migrate`                           |

To run another check file, replace `check-invite.js` with any `scripts/check-*.js` file.

`test` runs the Prettier format check, ESLint and the contrast, invite, RSVP and site checks in `scripts/` with the Node.js test runner.
The RSVP and site checks run the API against an in-memory PGlite database.
It does not run the type check or the browser tests.

`test:browser` starts `scripts/server.js` on port 4321 with an in-memory database and runs the Playwright tests in Chromium. It runs the layout tests in WebKit too, because Safari sizes date and time inputs differently.
Before the first run, install the browsers with `pnpm exec playwright install chromium webkit`.
The run fails when another program already uses port 4321.
The tests fail when a page breaks the Content-Security-Policy.

### Tooling notes

- `.gitattributes` forces LF line endings. A CRLF checkout makes `pnpm format:check` fail on every file and makes the vendored library hash check fail.
- pnpm refuses package releases younger than its minimum release age. When you upgrade a dependency, pick a release older than that age.

## Deployment

Vercel's GitHub integration deploys every push to `main` to production.
No check holds a deployment back.
Run `pnpm test`, `pnpm typecheck` and `pnpm test:browser` locally before you push `main`.
After you enable the workflow, you can add a Vercel Deployment Check on the `checks` job, which holds production until the GitHub checks pass.
Pushes to other branches get preview deployments.
Vercel runs `pnpm install --prod --frozen-lockfile`, then `pnpm build`, and serves `dist/` as static files.
`scripts/build.js` copies only the site files from an allowlist into `dist/`: the root pages, images, `robots.txt`, `sitemap.xml` and `THIRD_PARTY_NOTICES.txt`, and `css/`, `fonts/`, `vendor/` and the `js/` modules.
A new kind of site file needs an entry in that allowlist.
`check-site.js` fails when a page, or a file a page loads, is missing from the build, and when the build contains package files, server code, migrations, tooling or documentation.
The install needs `package.json`, `pnpm-lock.yaml` and `pnpm-workspace.yaml`, and the API functions need `api/`, `server/` and `migrations/`, so `.vercelignore` uploads them.
They are never site content, because Vercel serves only `dist/` and the functions.
`.vercelignore` keeps the other scripts, tooling and documentation out of the upload.
`vercel.json` rewrites every `/api/` path to the function in `api/index.js`.

`vercel.json` sends a Content-Security-Policy and other security headers on every path.
`scripts/server.js` reads the headers from `vercel.json`, and `check-site.js` fails when it answers a path differently from production.

### Database

The API reads `DATABASE_URL`, the pooled connection string that the Vercel Neon integration sets.
The Development, Preview and Production environments all connect to the same Neon resource, and nobody has verified that they use different branches.
Until a separate Neon branch for development is verified, treat every Neon connection string as production data.
Local development and every test use PGlite, so they never need a Neon connection string.

Vercel Cron calls `/api/retention` daily at 03:17 UTC, as `vercel.json` schedules. That route deletes each invitation and its replies 90 days after the later of the event date and the last change, and a Vercel Hobby project allows one such run per day. Cron runs only on production deployments. The route needs no secret, because it deletes only what the next scheduled run deletes. `RETENTION_DAYS` in `server/api.js` sets the period, and `privacy.html` states it.

Apply schema changes with `pnpm migrate`, which applies the unapplied files in `migrations/` in name order and needs the direct connection string in `DATABASE_URL_UNPOOLED`:

```bash
DATABASE_URL_UNPOOLED='<connection string>' pnpm migrate
```

Run it first against a verified non-production Neon branch, then against production before you deploy the code that needs the change.
Never commit a connection string or an `.env` file.

Every page loads Vercel Web Analytics.
`js/analytics.js` removes the part after `#` from every address it reports, so private links never reach analytics.
Enable Web Analytics in the Vercel project dashboard before deploying.

The contact address is `contact@petalpost.ro`.
To change it, replace `CONTACT` in `js/invite.js`, which also addresses the report link, and the address in the body of `about.html`, run `pnpm pages`, then run `pnpm exec node scripts/check-site.js`.

If the production domain changes, update the canonical and Open Graph URLs in the hand-written pages, `robots.txt` and `sitemap.xml`, then run `pnpm pages`, which takes the origin from the `index.html` canonical.
Then run `pnpm exec node scripts/check-site.js` to find any copy you missed.

### Search indexing

`sitemap.xml` lists every page whose robots tag allows indexing, each with a `<lastmod>` date.
When you change a page's content, set its `lastmod` to that day; leave it alone for layout or code changes, since Google ignores `lastmod` dates that change without content changes.
`vercel.json` redirects `/index.html` to `/` with a 301, so the home page has one URL; link to `/`, never to `index.html`.
Google Search Console verifies `petalpost.ro` as a Domain property through a `google-site-verification` TXT record in the domain's DNS, which Vercel hosts. It covers every subdomain and protocol, so no page carries a verification tag.

### Domain

Production is `https://www.petalpost.ro`. In the Vercel project's Domains settings, `www.petalpost.ro` is the primary domain, and `petalpost.ro` and `petalpost-beryl.vercel.app` redirect to it, so Google sees one origin.

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
