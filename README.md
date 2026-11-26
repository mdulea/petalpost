# Petalpost

Petalpost is a website where anyone can design an invitation in the browser and share it.
This README tells developers how to install, run, test, deploy and contribute to it.

## Overview

A visitor chooses a template and adds a photo, names, a date and an address.
The editor then downloads the invitation as a PNG or publishes it to collect replies.
Guests reply from the invitation link, and the host sees the replies and totals on a private management page.
The pages are static HTML, CSS and JavaScript.
API functions on the same origin store published invitations and replies in Neon Postgres.
It runs at `https://www.petalpost.ro`.

See the [glossary](GLOSSARY.md) for the terms used to describe invitations and replies and the [domain decisions](docs/decisions/) for the choices behind their behavior.

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
3. Click "Download PNG" to save the invitation as an image with the photo.
4. Click "Publish" to store the invitation and get an invitation link and a management link.
5. Open the invitation link in another browser and send a reply.
6. Open the management link to see the replies and totals, or to delete the invitation.

Publishing stores the text, the template and the color on the server. The photo stays in the browser, so only the PNG carries it.
"Guest view" opens a share link that carries the same fields after the `#`, without the photo. Share links sent before the editor dropped "Copy share link" still open.
The editor keeps the draft, the photo and the published invitation's management secret in the browser's local storage, so a reload restores them.
A lost management link cannot be recovered.

## Product facts

Site copy, template text and UI strings make only the claims in this section.
When the code changes one of these facts, update this section and every page that states it in the same pull request.

The promises:

- Petalpost is free. It has no paid plan, no paywall at export and no watermark on the PNG.
- Hosts and guests need no account and no email address.
- The site sets no cookies and loads nothing from another origin except Vercel Web Analytics, which sets no cookie.
- The photo never leaves the host's browser.
- The server stores the party names the host enters on a guest list, and when each personal link was first and last opened. Deleting the invitation deletes those names and times.
- Petalpost counts a fixed set of actions per day and page language, and stores no cookie, identifier, IP address or invitation content with the counts.
- The site is in English and Romanian. Botez, Cununie and Moț exist only in Romanian.

A host can:

- choose a template, add a photo, names, a date, a time, a venue, an address and a note, and pick one of six accent colors;
- download the invitation as a PNG with the photo;
- publish the invitation and get an invitation link and a management link;
- choose the open mode or the guest-list mode on the first publish. The open mode is the default, and any guest with the invitation link replies in it. In the guest-list mode, the invitation link shows the invitation without a reply form, and the tracker shows the guest list;
- add up to 300 parties to the guest list, one name at a time or one name per pasted line, and rename or delete parties from the tracker. The host can search names, filter by party status, see totals for the whole guest list and download it as a CSV;
- use the management link to add a party with a name, default seats and language, share its personal link message by copying it or opening WhatsApp, and preview the party's page without recording an opened time. The host can revoke the link or generate a new one without changing the party's reply. The tracker shows each party's status, when its personal link was first and last opened, its reply, note and any seats over its default after opening the management link or after a passkey sign-in. The host can edit each party's reply seats;
- set, change and clear an optional RSVP deadline in the tracker, checked in Europe/Bucharest time, and edit a party's reply in the tracker even after the deadline;
- publish changes from the browser that published the invitation, which keeps the link and the replies;
- see every reply with its note and the totals on the management page, download the replies as a CSV file, and delete the invitation with all its replies;
- save a passkey for the invitation on the management page with Face ID, a fingerprint or Windows Hello, and on another device with the same Apple, Google or Microsoft account use "Find my invitations" on the home page to open the management page for an hour.

For a passkey, the server stores the credential id, the public key and a signature counter with the invitation, and no name, email address or biometric data. The Apple, Google or Microsoft account that syncs the passkey belongs to the host's device, so hosts still need no Petalpost account and no email address. Deleting the invitation deletes its passkeys. A passkey sign-in can view and download the replies or the guest list, rename and delete parties, and delete the invitation. It cannot add parties, manage personal links or save another passkey.

A host cannot:

- put the photo on the published invitation, which shows the template art instead;
- recover a lost management link, although a saved passkey still opens the management page;
- change the mode after the first publish;
- delete a single reply or edit an open-mode reply;
- publish changes from another browser, because only the publishing browser keeps the management secret;
- start a separate new invitation while keeping the current one, as [decision 0001](docs/decisions/0001-start-a-new-invitation-explicitly.md) records;
- publish more than 20 invitations from one IP address in a day;
- keep an invitation longer than 90 days after its event date, or 90 days after its last change when it has no date.

A guest can:

- open the invitation link in any browser, add the event to a calendar with reminders one day and two hours before it, and open the address on a map;
- see the days left before the event, then the hours on its day;
- reply with a name of up to 80 characters, whether the party attends, a party size of up to 10 and an optional note of up to 300 characters for the host;
- view, change or withdraw an open-mode reply through its reply edit link;
- open a personal link to see the party's greeting and reply on its behalf with up to 20 seats. The guest can view, change or withdraw the reply through the same link until the RSVP deadline passes. After it passes, the personal link shows the reply read-only;
- share a view link from the personal link. The view link shows the party's greeting and invitation and keeps the reply private.

A guest cannot see other guests' replies or the totals.

## Project structure

- `public/` holds every file the site serves, laid out as its URLs:
  - `index.html` is the landing page, `editor.html` is the editor and the guest view, and `manage.html` is the host's management page.
  - The occasion pages show one occasion's templates and advice. `pnpm pages` generates one page for each entry in `scripts/occasions.js` and `scripts/occasions-ro.js`, at the file that the entry names, such as `birthday-invitations.html`. Do not edit them by hand.
  - `invitation-wording.html` and `when-to-send-invitations.html` are the guides, and `about.html`, `privacy.html`, `terms.html` and `404.html` are the remaining pages.
  - `ro/` holds the Romanian site: `ro/index.html`, `ro/editor.html`, `ro/manage.html`, the Romanian occasion pages, the hand-written guides `ro/text-invitatii.html`, `ro/cand-sa-trimiti-invitatiile.html` and `ro/invitatii-digitale-sau-tiparite.html`, which is the only guide without an English pair, and `ro/despre.html`, `ro/confidentialitate.html` and `ro/termeni.html`.
  - `js/` holds the page scripts:
    - `templates.js` is the template catalog and the `renderInvite` renderer.
    - `invite.js` handles invite records, share links, the storage policy and the calendar file. It has no DOM access, so the Node checks import it.
    - `rsvp.js` validates replies, builds and reads private links, is the API client and sends the action counts. It has no DOM access, so the server and the Node checks import it.
    - `csv.js` builds the replies CSV file of the management page. It has no DOM access, so the Node checks import it.
    - `passkey.js` saves a passkey on the management page and signs in with one on the home page. It has no DOM access, so the Node checks import it.
    - `mount.js` puts rendered invites into the page and fits their text. It runs only in the browser.
    - `motion.js` holds the motion rules: Web Animations API only, a new animation cancels the running one, and nothing animates under reduced motion. It runs only in the browser.
    - `editor.js`, `manage.js` and `landing.js` are the entry modules of the editor, the management page and the landing page.
    - `tracker/` holds one module for each section of the management page, the tracker. `public/js/tracker/sections.js` lists them with the modes that show each one. A new section adds its module, one entry in that list and its `<section>` element in `manage.html` and `ro/manage.html`, and `check-site.js` fails when the list and the pages disagree. `page.js` is the entry module of the occasion pages, the guides and the About page.
    - `icons.js` injects the inline SVG sprite.
    - `analytics.js` is a classic script that sets up the Vercel Web Analytics queue.
  - `css/` holds the styles, and `fonts/` holds the self-hosted fonts.
  - `vendor/html-to-image.js` is html-to-image 1.11.11, the library that renders the PNG. Its license is in `THIRD_PARTY_NOTICES.txt`.
  - `sitemap.xml` lists the indexed pages. `pnpm pages` generates it; do not edit it by hand.
  - `previews/` holds one link preview image per template. `pnpm previews` generates them.
  - `og-image.png`, `ro/og-image.png`, `favicon.svg` and `robots.txt` are the remaining site files.
- `types/globals.d.ts` declares the types of the `htmlToImage` and analytics globals for the type check.
- `api/index.js` is the Vercel Function for `/api/`, `/e/{id}` and `/ro/e/{id}` paths. Vercel requires it in `api/`.
- `server/` holds the server code. `server/api.js` matches each `/api/` request to a route and turns refusals into error responses. `server/routes/` holds one route module each for invitations, passkeys, replies, retention and stats, `server/routes/index.js` lists them, and `server/routes/shared.js` holds the helpers they share. `server/webauthn.js` verifies passkey registrations and sign-ins with `node:crypto`, `server/event-page.js` serves the published invitations, `server/postgres.js` connects to Postgres, and `server/migrate.js` applies the SQL files in `server/migrations/`.
- `scripts/` holds the scripts a developer runs:
  - `server.js` is the local server for `pnpm dev` and the browser tests.
  - `browser-port.js` picks the port that the browser tests run the server on.
  - `build.js` copies `public/` into `dist/`, which Vercel serves.
  - `pages.js` generates the HTML that search engines must read without running JavaScript: the English and Romanian occasion pages, the hreflang links, the JSON-LD structured data on the home, occasion and guide pages, the landing galleries and occasion links, every page footer and `sitemap.xml`. It fills the regions between `<!-- generated:NAME -->` markers. `lastmod.json` keeps each indexed page's sitemap date with a fingerprint of its content. `occasions.js` holds the English occasion copy, and `occasions-ro.js` holds the Romanian occasion copy.
  - `og-card.html` and `og-card.js` generate `og-image.png`.
  - `previews.js` writes the link preview image of each template through `preview-card.html` and `preview-card.js`.
  - `worktree.js` adds and removes the worktrees that [Workflow](#workflow) describes.
  - `shot.js` writes a PNG of a page or of one element on it.
  - `command-guard.js` is the agent hook that rejects shell commands that call `node` or `npx` directly.
  - `sweep-plan.js` prints the order in which `/sweep` implements the open issues, and the issues it leaves alone.
- `tests/` holds the checks that `pnpm check` runs:
  - `check-*.js` are the Node checks that `pnpm test` runs. The header comment of `check-site.js` states what the file covers, and the header comment of each other file lists what it checks.
  - `api-setup.js` starts the API against an in-memory PGlite database and publishes an invitation for the Node checks, `passkey-authenticator.js` is the software authenticator of the passkey checks, and `browser-setup.js` holds the page watcher, the separate browser and the publish step of the browser tests.
  - `browser.spec.js`, `rsvp.spec.js`, `guest-list.spec.js`, `passkey.spec.js` and `layout.spec.js` hold the browser tests that `pnpm test:browser` runs. `rsvp.spec.js` publishes, replies and manages invitations through the real API, with a separate browser for the host and each guest. `layout.spec.js` checks alignment, target sizes and that the Preview button never covers the focused field. It runs at both sides of every width breakpoint in `public/css/styles.css` and at common phone, tablet and desktop sizes up to 4K.
  - Playwright writes its output to `node_modules/.cache/playwright/`. Every tool already ignores `node_modules/`.
- `.github/workflows/checks.yml` runs `pnpm check` on each pull request event and on each push to `main`.
- `.claude/settings.json` runs `scripts/command-guard.js` before each shell command that Claude Code runs.
- `.claude/skills/sweep/` is the Claude Code skill behind `/sweep`. It writes each run's session results, retrospectives and report to `.sweep/`, which git ignores.
- `docs/petalpost-flow.html` is a diagram of the site flow, and `docs/decisions/` holds the recorded decisions.
- The root keeps the configs that ESLint, TypeScript, Playwright, pnpm and Vercel look for there, `package.json` with the Prettier settings, and `README.md`, `AGENTS.md` and `GLOSSARY.md`.

## Development

| Task                | Command                                                            |
| ------------------- | ------------------------------------------------------------------ |
| All checks          | `pnpm check`                                                       |
| Fast checks         | `pnpm check:fast`                                                  |
| Test suite          | `pnpm test`                                                        |
| One check file      | `pnpm exec node tests/check-invite.js`                             |
| Filtered check file | `pnpm exec node --test-name-pattern="sitemap" tests/check-site.js` |
| Check names         | `pnpm exec node --test --test-reporter=spec tests/check-site.js`   |
| One browser test    | `pnpm test:browser tests/browser.spec.js -g "landing filter"`      |
| Lint                | `pnpm lint`                                                        |
| Format and fix      | `pnpm fix`                                                         |
| Format check        | `pnpm format:check`                                                |
| Type check          | `pnpm typecheck`                                                   |
| Browser tests       | `pnpm test:browser`                                                |
| Site build          | `pnpm build`                                                       |
| Generate pages      | `pnpm pages`                                                       |
| Link previews       | `pnpm previews`                                                    |
| Screenshot          | `pnpm shot <path> [<selector>] <file>`                             |
| Sweep plan          | `pnpm sweep-plan [<issue numbers>]`                                |
| Migrations          | `pnpm migrate`                                                     |

To run another check file, replace `check-invite.js` with any `tests/check-*.js` file.
The check names command runs one check file and prints the name of each check, and the `check-site.js` header names only what the file covers.
`--test-name-pattern` runs only the tests whose names match the regular expression, and `-g` does the same for browser tests.
Each targeted command finishes in seconds, so rerun the check you are working on with one of them and run `pnpm check` once at the end.
`check-filter.js` fails when a check file keeps running after its filtered tests finish.

`fix` rewrites formatting with Prettier and applies the ESLint fixes that ESLint can make itself.
Run it before `check`. `check` reports formatting and lint errors and never rewrites a file.

`check` runs `test`, `typecheck` and `test:browser` in that order, and CI runs the same command.

`shot` writes a PNG of a page, or of the first element that a CSS selector matches, such as `pnpm shot editor.html "#previewCard" card.png` for a template's artwork.
Without a selector, it writes the full page.
It starts `scripts/server.js` on a free port with an in-memory database, so it runs next to `pnpm dev` and the browser checks, and Chromium renders the page at 1280 by 720.
When the selector matches nothing or the path answers with an error status, it writes no file and exits with status 1.
Git Bash rewrites an argument that starts with `/` into a Windows path, so write the path without the leading `/`, such as `ro/` for the Romanian home page.

`test` runs the Prettier format check, ESLint and the browser port, command guard, contrast, countdown, DOM-free, filter, invite, paths, RSVP, screenshot, site and worktree checks in `tests/` with the Node.js test runner.
The RSVP and site checks run the API against an in-memory PGlite database.
It does not run the type check or the browser tests.

`test:browser` starts `scripts/server.js` with an in-memory database and runs the Playwright tests in Chromium. It runs the layout tests and the tests tagged `@webkit` in WebKit too, because Safari sizes date and time inputs differently. The tagged tests check the focus and error descriptions of the reply form in Safari.
Before the first run, install the browsers with `pnpm exec playwright install chromium webkit`.
The main checkout and CI run the server on port 4321.
Each worktree runs it on a port between 4400 and 4999 that is derived from the worktree's path, so worktrees can run their browser checks at the same time, and a worktree gets the same port on every run.
`BROWSER_CHECK_PORT` sets the port directly, such as `BROWSER_CHECK_PORT=4322 pnpm test:browser`.
When another program already uses the port, the server exits with a message that names the port, and the run fails.
Browser tests open paths such as `/editor.html`, and lint rejects a local address with a port in a browser test.
The tests fail when a page breaks the Content-Security-Policy.

### Page languages

`ROUTE_PAIRS` in `public/js/i18n.js` pairs each English page with its Romanian page, and `en: null` or `ro: null` marks a page that exists in one language.
`alternatesFor` in the same file builds the hreflang alternate links from those pairs, and the language switch links come from `languageSwitchHref`.
`pnpm pages` writes the alternate links into every page.

### UI strings

`UI` in `public/js/i18n.js` holds the strings that scripts write into pages, with one group per feature under `en` and `ro`.
The `editor` group has the host's editor and publishing strings, `guest` has the guest view and reply form, `manage` has the management page, and `passkey` has the passkey messages of the management page and the home page.
The `guestList` group has the tracker guest list strings, `deadline` has the RSVP deadline strings, and `personal` has the party greeting, reply form and view link sharing strings.
A script reads its group once, such as `UI[lang].guest`.
A new feature adds its own group under `en` and under `ro`, with the same keys in both, and leaves the other groups unchanged.
`apiMessages` in the same file holds the API error messages for both languages.
`check-invite.js` fails when a group or the API messages have a key in one language that the other lacks.

### Add an occasion

1. Add the occasion's first template as [Add a template](#add-a-template) describes, with the new category name in `category`.
2. For a Romanian occasion, add the category to `RO_CATEGORIES` in `public/js/templates.js` at its place in the Romanian order. The English order follows the order of each category's first template in `TEMPLATES`.
3. Add the category's label to `CATEGORY_LABELS` in `public/js/i18n.js` for each language that shows it.
4. Add a route to `ROUTE_PAIRS` in `public/js/i18n.js` with a `key`, the page file for each language, `null` for a language without the occasion, and `indexed: true`.
5. Add the page copy to `scripts/occasions.js`, `scripts/occasions-ro.js` or both, keyed by the category: `file`, `heading`, `description`, `lead` and `sections`. The heading is plain text without `<` or `&`. A Romanian description holds one of the Romanian search phrases from `check-site.js`.
6. Run `pnpm pages`. It writes the occasion page, and the occasion links, footers, galleries, structured data and sitemap entries of the other pages.
7. Update the tests that name occasions: the category order check in `check-invite.js` for a Romanian occasion, and in `browser.spec.js` the Romanian gallery filter counts and the list of pages that load their icons. Add the page to a page list in `layout.spec.js`.

`check-site.js` fails when a category has no label or no page copy, and when the new page has no breadcrumb, alternate links or sitemap entry.

### Add a template

1. Add an entry to `TEMPLATES` in `public/js/templates.js` with `id`, `name`, `category`, `tagline`, `frame`, `titleFont`, `colors`, `defaults` and `art`. Published invitations store the id, so never change it after release. Sample text that `defaults` leaves out comes from the category's first template.
2. For a template in one language only, set `locales`, such as `locales: ['ro']`, and write `name`, `tagline` and `defaults` in that language.
3. For a template in both languages, add its Romanian `name`, `tagline` and `defaults` to `RO_TEMPLATE_COPY` in `public/js/templates-ro.js`, keyed by the id.
4. For a new `frame` or `titleFont` value, add the `.frame-<frame>` or `.font-<titleFont>` rule to `public/css/styles.css`.
5. Run `pnpm pages`. It writes the template into the galleries of the home page and the occasion page.
6. Run `pnpm previews`. It writes the template's link preview image into `public/previews/`.
7. Update the tests that count templates: the Romanian gallery filter counts in `browser.spec.js`, and for a Moț template the id list in `check-invite.js` and the Moț picker and gallery tests in `browser.spec.js`.

`check-contrast.js` fails when the template's colors or an accent swatch on its background drop below 4.5:1, `check-invite.js` fails when a template in both languages has no Romanian copy, and `check-site.js` fails when a frame or font has no CSS rule or the template has no link preview image.

### Add an API route

1. Create a module in `server/routes/` that exports `routes`, a list of `{pattern, methods}` entries. `pattern` matches the whole path and captures its ids, and `methods` maps each HTTP method to an action. An action gets `{db, request, ids, dailyEvents}` and returns a `Response`, or throws a `Refusal` from `server/routes/shared.js`.
2. List the module's endpoints and their contract in its header comment.
3. Add the module to `ROUTES` in `server/routes/index.js`.
4. Add a Node check file `tests/check-<module>.js` that imports `setup`, `publishedEvent` and the credentials it needs from `tests/api-setup.js`. A browser test of the route goes in a spec file of its own that imports from `tests/browser-setup.js`.

`server/api.js` refuses an id that does not match `ID_PATTERN` before it calls the action.
A limit that an error message names also goes into `LIMITS` in `server/api.js`, which passes it to `apiMessages` in `public/js/i18n.js`.

### Tooling notes

- `.gitattributes` forces LF line endings. A CRLF checkout makes `pnpm format:check` fail on every file and makes the vendored library hash check fail.
- Claude Code rejects an agent shell command that starts with `node` or `npx`, or calls either after a command separator, and its message names `pnpm exec`. A global Node.js install on the PATH can run another version than the one `package.json` pins. `.claude/settings.json` runs the check, and `check-command-guard.js` tests it against allowed and rejected sample commands.
- pnpm refuses package releases younger than its minimum release age. When you upgrade a dependency, pick a release older than that age.

## Deployment

Vercel's GitHub integration deploys every commit on `main` to production.
A Vercel Deployment Check in the project settings holds each production deployment until the GitHub `checks` job passes.
`git.deploymentEnabled` in `vercel.json` turns off Git deployments for every other branch, so Vercel builds no previews.
The Vercel CLI is not installed locally or as a dependency; invoke it with `pnpm dlx vercel`.
On the Vercel Hobby plan, function invocation metrics older than 30 minutes require Observability Plus on Pro, so CLI metric queries beyond that window return `payment_required`.
Vercel runs `pnpm install --prod --frozen-lockfile`, then `pnpm build`, and serves `dist/` as static files.
`scripts/build.js` copies `public/` into `dist/`, so a new site file needs only a place in `public/`.
`check-site.js` fails when a page, or a file a page loads, is missing from the build, and when the build contains package files, server code, migrations, tooling or documentation.
The install needs `package.json`, `pnpm-lock.yaml` and `pnpm-workspace.yaml`, and the API functions need `api/` and `server/`, so `.vercelignore` uploads them.
They are never site content, because Vercel serves only `dist/` and the functions.
The build copies `public/`, and `server/event-page.js` reads the editor pages from it, so the upload includes it too.
`.vercelignore` keeps the other scripts, the tests, tooling and documentation out of the upload.
`vercel.json` rewrites `/api/`, `/e/{id}` and `/ro/e/{id}` paths to the function in `api/index.js`.

`vercel.json` sends a Content-Security-Policy and other security headers on every path.
`scripts/server.js` reads the headers from `vercel.json`, and `check-site.js` fails when it answers a path differently from production.

### Database

The API reads `DATABASE_URL`, the pooled connection string that the Vercel Neon integration sets.
The Development, Preview and Production environments all connect to the same Neon resource, and nobody has verified that they use different branches.
Until a separate Neon branch for development is verified, treat every Neon connection string as production data.
Local development and every test use PGlite, so they never need a Neon connection string.

Vercel Cron calls `/api/retention` daily at 03:17 UTC, as `vercel.json` schedules. That route deletes each invitation and its replies 90 days after the later of the event date and the last change, and a Vercel Hobby project allows one such run per day. Cron runs only on production deployments. The route needs no secret, because it deletes only what the next scheduled run deletes. `RETENTION_DAYS` in `server/routes/retention.js` sets the period, and `privacy.html` states it.

Apply schema changes with `pnpm migrate`, which applies the unapplied files in `server/migrations/` in name order and needs the direct connection string in `DATABASE_URL_UNPOOLED`:

```bash
DATABASE_URL_UNPOOLED='<connection string>' pnpm migrate
```

In PowerShell, set the variable for the session, run the migration and clear the variable afterwards:

```powershell
$env:DATABASE_URL_UNPOOLED = '<connection string>'
pnpm migrate
Remove-Item Env:DATABASE_URL_UNPOOLED
```

No non-production Neon branch exists, so run it against production before you merge the pull request whose code needs the change.
A `/sweep` run applies migrations itself, and no other agent session may run `pnpm migrate` against Neon.
Production runs the previous code until the merge deploys, so a migration must keep that code working.
For example, add a new column instead of renaming one that the deployed code reads.
Never commit a connection string or an `.env` file.

Migration `004_action_counts.sql` adds the `action_counts` table, which counts a fixed set of actions per UTC day and page language.
The server counts `invitation_publish` when it stores a new invitation and `reply_submit` when it stores a new reply.
The editor and the guest view send `png_download`, `png_share`, `invitation_link_copy`, `invitation_link_share` and `calendar_add` to `/api/stats` after the action succeeds.
That route has no per-client cap, so the browser counts are approximate.
A row holds only the day, the action, the language and the count, and the retention job keeps every row.
Read the totals in the Neon console SQL editor:

```sql
select day, action, lang, count from action_counts order by day desc, action, lang;
```

Migration `005_guest_lists.sql` adds the tables and columns of the guest-list features.
It adds the `parties`, `seating_tables`, `passkeys`, `passkey_challenges` and `access_tokens` tables, which an invitation's deletion deletes with it.
The passkey routes read and write `passkeys`, `passkey_challenges` and `access_tokens`.
The personal link and view link API use `parties`. The tracker reads it alongside the party replies.
A reply in `responses` belongs to a party or to no party, and it holds answers per sub-event and meal counts.
The invitation settings of the guest-list features live in the invitation's stored content `d`, so the `events` table is unchanged.
`d.mode` is `open` or `guestList`, and a `d` without a mode, stored before invitations had modes, is open.
`tests/check-migrations.js` applies the migrations to an empty database and to one with the earlier schema and data.

Every page loads Vercel Web Analytics.
`public/js/analytics.js` removes the part after `#` from every address it reports, so private links never reach analytics.
Enable Web Analytics in the Vercel project dashboard before deploying.

The contact address is `contact@petalpost.ro`.
To change it, replace `CONTACT` in `public/js/invite.js`, which also addresses the report link, and the address in the body of `public/about.html`, run `pnpm pages`, then run `pnpm exec node tests/check-site.js`.

If the production domain changes, update the canonical and Open Graph URLs in the hand-written pages and `robots.txt`, then run `pnpm pages`, which takes the origin from the `index.html` canonical.
Then run `pnpm exec node tests/check-site.js` to find any copy you missed.

### Search indexing

`sitemap.xml` lists every page whose robots tag allows indexing, each with a `<lastmod>` date.
`pnpm pages` writes it from the indexed pages, so run `pnpm pages` after you change a page or add one.
Google ignores `lastmod` dates that change without content changes, so a page's date moves only when its content changes.
The content of a hand-written page is its text outside the generated regions, and the content of an occasion page is its copy in `scripts/occasions.js` or `scripts/occasions-ro.js`.
`scripts/lastmod.json` keeps each page's date with a fingerprint of that content, and `pnpm pages` gives a page with a new fingerprint the current UTC date, which the future-date check accepts at any local time.
A change inside a generated region, such as a new footer link, or a whitespace change leaves every date alone.
`check-site.js` fails when `sitemap.xml` or `scripts/lastmod.json` differs from the `pnpm pages` output, so a content change without `pnpm pages` fails the checks.
`vercel.json` redirects `/index.html` to `/` with a 301, so the home page has one URL; link to `/`, never to `index.html`.
Google Search Console verifies `petalpost.ro` as a Domain property through a `google-site-verification` TXT record in the domain's DNS, which Vercel hosts. It covers every subdomain and protocol, so no page carries a verification tag.

### Domain

Production is `https://www.petalpost.ro`. In the Vercel project's Domains settings, `www.petalpost.ro` is the primary domain, and `petalpost.ro` and `petalpost-beryl.vercel.app` redirect to it, so Google sees one origin.

`og-image.png` is the 1200 by 630 link preview.
To regenerate it:

1. Run `pnpm dev`.
2. Open `http://localhost:3000/scripts/og-card.html`.
3. Click "Save og-image.png".
4. Move the downloaded file to `public/` and commit it.

A published invitation's link preview names its template's image in `public/previews/` instead.
Each image is a 1200 by 630 JPEG of the template's art on its background color with the Petalpost wordmark.
It has no other text, so English and Romanian invitations share it.
After you change a template's art or add a template, run `pnpm previews` and commit the images.
The command renders every template in Chromium and overwrites its image.
`check-site.js` fails when a template has no image or an image is 300 KB or larger, because WhatsApp drops larger preview images.

## Workflow

Every change reaches `main` through a pull request.
Branch protection on `main` requires a pull request and a passing `checks` job, blocks force pushes and deletion, and applies to administrators too.
The `checks` workflow runs on each pull request event, such as opening the pull request or pushing to its branch, and on each push to `main`.
A push to a branch without a pull request runs no checks.
The main checkout stays on `main` and changes only through `git pull --ff-only`.

1. In the main checkout, with no uncommitted changes, run `pnpm worktree add <type> <task>`.
   The type is one of `feat`, `fix`, `docs`, `refactor`, `test` and `chore`.
   The task is lowercase words joined by hyphens, such as `setup-guide`.
   The command fetches `origin`, creates branch `<type>/<task>` from `origin/main`, adds the worktree `.worktrees/<type>-<task>`, and installs the dependencies from the main checkout's `.pnpm-store/`.
2. Commit in that worktree. Each behavior change adds or updates a check in `tests/`.
3. Run `pnpm check`.
4. Push with `git push -u origin HEAD` and open a pull request with `gh pr create`.
   When the pull request adds a migration, its body says so.
   Outside a `/sweep` run, you apply the migration to production as [Database](#database) describes before you merge.
5. Squash-merge the pull request after the `checks` job passes.
   The repository allows only squash merges, builds the commit message from the pull request title and body, and deletes the remote branch.
6. In the main checkout, run `git pull --ff-only` and `pnpm worktree remove <type>-<task>`.
   The command removes the worktree, and `.worktrees/` once it is empty.
   It force-deletes the local branch, because a squash merge leaves that branch unmerged.
   It prunes the remote-tracking branches whose remote branch GitHub deleted, and deletes the remote branch when it still exists.
   When Windows refuses to delete the worktree folder, because a shell or another program still uses it, the command retries the deletion for about 2 seconds and still deletes the branches.
   A folder that stays behind is named in the output, and the command exits with status 1.

### Commits and pull requests

- A commit subject and a pull request title state the reason for the change in the imperative and in sentence case, with no type prefix, such as `Run the format check and lint in pnpm test`.
- A commit body and a pull request body explain the approach and the context, constraints and tradeoffs that the diff does not show. Leave implementation details to the diff.
- When a formatting-only commit lands on `main`, add its hash to `.git-blame-ignore-revs`.

Agents: [AGENTS.md](AGENTS.md).
In Claude Code, `/sweep [--max <n>] [<issue numbers>]` works through the open issues in dependency order and stops after the 15th merged pull request, or after `n`.
It runs one headless Claude Code session for each issue, at most three at once, and each session opens one pull request.
The coordinating session merges each pull request once its checks pass, closes the parent issues and reports the pull requests with the findings of every session's retrospective.
Before it merges a pull request that adds a migration, it applies the migration to production with the connection string in the main checkout's `.env.local`.
[.claude/skills/sweep/SKILL.md](.claude/skills/sweep/SKILL.md) lists the steps.
