## Invariants

- always: fonts + code self-hosted; pages load nothing external except Vercel's `/_vercel/insights/script.js`
- forbidden: edit `vendor/` (byte-for-byte as published); commit `.env.local` or other `.env.*`
- ask first: changing production domain `https://petalpost-beryl.vercel.app`
- NEVER skip/disable/delete failing checks to pass

## Docs

README.md sections, by need:

- project, setup, commands, layout -> Overview, Installation, Run, Development, Project structure
- env vars `DATABASE_URL`, `DATABASE_URL_UNPOOLED`; database, migrations -> Deployment, Database
- line endings, dependency upgrades, install errors -> Tooling notes
- deployment, security headers, placeholder contact address, production-origin changes -> Deployment

## Code

- commands via `pnpm` only; global Node.js install forbidden
- plain JavaScript; JSDoc types only where inference fails, e.g. DOM lookup element types; TypeScript strict off
- module/function comments state contract; follow existing pattern
- DOM-free logic -> `js/invite.js` or `js/templates.js`, so `scripts/` checks run in Node
- new dependency -> justify

## Testing

- behavior change -> add/update `node:test` checks in `scripts/`; test added to `scripts/check-*.js` -> update header comment listing checks
- before finishing: `pnpm test`, `pnpm typecheck`, `pnpm test:browser` all pass

## Gotchas

- `scripts/server.js` matches Vercel: `vercel.json` headers; clean URLs off so `/editor.html` loads without redirect; `/` -> `index.html`; dir listings off; `/api/*` -> PGlite, never Neon; `check-site.js` checks it
- `DATABASE_URL_UNPOOLED` for `pnpm migrate` -> verified non-production Neon branch first
- inline scripts blocked by CSP -> page scripts in files; inline `style` attributes allowed for `renderInvite`
- package store: `.pnpm-store/` inside repo
- `js/analytics.js` == classic script; ESLint `sourceType: 'script'`
- new page-level global from classic script -> declare in `js/globals.d.ts` + ESLint globals
- pushing `main` releases to production -> run [Testing](#testing) checks first
- new non-site file -> `.vercelignore`
- `*-invitations.html`, landing gallery, page footers == `pnpm pages` output -> edit `scripts/pages.js` or `scripts/occasions.js`, rerun; `check-site.js` fails on drift

## Git and output

- worktrees -> `.worktrees/`
- commit subject: imperative sentence-case reason, type prefix forbidden, e.g. `Run the format check and lint in pnpm test`; blank line; body: approach rationale + context/constraints/tradeoffs absent from diff; implementation details -> diff only
- formatting-only commit -> hash to `.git-blame-ignore-revs`
- output: changes, reasons, tests
