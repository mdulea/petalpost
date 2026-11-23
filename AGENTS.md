## Invariants

- always: fonts + code self-hosted; pages load nothing external except Vercel's `/_vercel/insights/script.js`
- forbidden: edit `vendor/` (byte-for-byte as published); commit `.env.local` or other `.env.*`
- ask first: changing production domain `https://www.petalpost.ro`
- NEVER skip/disable/delete failing checks to pass

## Docs

README.md sections, by need:

- project, setup, commands, layout, generated pages -> Overview, Installation, Run, Development, Project structure
- worktrees, branches, checks, pull requests, merges, commit + pull request messages -> Workflow
- env vars `DATABASE_URL`, `DATABASE_URL_UNPOOLED`; database, migrations -> Deployment, Database
- line endings, dependency upgrades, install errors -> Tooling notes
- deployment, Vercel CLI, `.vercelignore`, security headers, contact address, production-origin changes -> Deployment

## Code

- commands via `pnpm` only; global Node.js install forbidden
- plain JavaScript; JSDoc types only where inference fails, e.g. DOM lookup element types; TypeScript strict off
- module/function comments state contract; follow existing pattern
- DOM-free logic -> `js/invite.js` or `js/templates.js`, so `scripts/` checks run in Node
- new dependency -> justify

## Testing

- behavior change -> add/update `node:test` checks in `scripts/`; test added to `scripts/check-*.js` or `scripts/*.spec.js` -> update header comment listing checks
- before finishing: `pnpm check` passes

## Gotchas

- `scripts/server.js` matches Vercel: `vercel.json` headers; clean URLs off so `/editor.html` loads without redirect; `/` -> `index.html`, `/ro/` -> `ro/index.html`; dir listings off; `/api/*`, `/e/{id}`, `/ro/e/{id}` -> PGlite, never Neon; `check-site.js` checks it
- inline scripts blocked by CSP -> page scripts in files; inline `style` attributes allowed for `renderInvite`
- package store: `.pnpm-store/` inside repo
- `js/analytics.js` == classic script; ESLint `sourceType: 'script'`
- new page-level global from classic script -> declare in `js/globals.d.ts` + ESLint globals

## Workflow

README Workflow == procedure; agent limits:

- work + commit only in own worktree; main checkout + other agents' worktrees forbidden
- push + open pull request only when user says branch ready
- merge, `pnpm worktree remove` -> only on request
- `pnpm migrate` against Neon forbidden
- output: changes, reasons, tests
