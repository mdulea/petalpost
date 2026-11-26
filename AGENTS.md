## Invariants

- always: fonts + code self-hosted; pages load nothing external except Vercel's `/_vercel/insights/script.js`
- forbidden: edit `public/vendor/` (byte-for-byte as published); commit `.env.local` or other `.env.*`
- ask first: changing production domain `https://www.petalpost.ro`
- NEVER skip/disable/delete failing checks to pass

## Docs

README.md sections, by need:

- project, setup, commands, layout, generated pages -> Overview, Installation, Run, Development, Project structure
- claims in site copy: free, no account, no watermark, host + guest abilities -> Product facts
- page language pairs, hreflang alternate links -> Page languages
- new occasion -> Add an occasion; new template -> Add a template; new API route -> Add an API route
- worktrees, branches, checks, pull requests, merges, commit + pull request messages -> Workflow
- env vars `DATABASE_URL`, `DATABASE_URL_UNPOOLED`; database, migrations -> Deployment, Database
- line endings, dependency upgrades, install errors -> Tooling notes
- deployment, Vercel CLI, `.vercelignore`, security headers, contact address, production-origin changes -> Deployment

## Code

- commands via `pnpm` only; tools via `pnpm exec <tool>`, e.g. `pnpm exec node tests/check-site.js`; global Node.js install forbidden
- site copy == pages, `scripts/occasions*.js`, template text, UI strings in `public/js/i18n.js`: the Writing output rules for human-facing prose apply; claims only from README Product facts
- plain JavaScript; JSDoc types only where inference fails, e.g. DOM lookup element types; TypeScript strict off
- module/function comments state contract; follow existing pattern
- DOM-free logic -> a module in `DOM_FREE` of `tests/check-dom-free.js`, so `tests/` checks run in Node
- new dependency -> justify

## Testing

- behavior change -> add/update `node:test` checks in `tests/`; test added to a `tests/` file whose header lists its checks -> update that list; `tests/check-site.js` header states coverage only
- new or edited browser test -> run it alone first, `pnpm test:browser <spec> -g "<name>"`; then full `pnpm check`
- before finishing: `pnpm fix`, then `pnpm check` passes

## Gotchas

- `scripts/server.js` matches Vercel: `vercel.json` headers; clean URLs off so `/editor.html` loads without redirect; serves `public/`; `/` -> `public/index.html`, `/ro/` -> `public/ro/index.html`; dir listings off; `/api/*`, `/e/{id}`, `/ro/e/{id}` -> PGlite, never Neon; `check-site.js` checks it
- inline scripts blocked by CSP -> page scripts in files; inline `style` attributes allowed for `renderInvite`
- package store: `.pnpm-store/` inside repo
- `public/js/analytics.js` == classic script; ESLint `sourceType: 'script'`
- new page-level global from classic script -> declare in `types/globals.d.ts` + ESLint globals

## Workflow

README Workflow == procedure; agent limits:

- work + commit only in own worktree; main checkout + other agents' worktrees forbidden, except post-merge cleanup
- push + open pull request only when user says branch ready
- T3 `pull_request_*` tools read main checkout branch -> from `.worktrees/` push + open via `gh pr create`
- merge -> only on request
- after own pull request merges -> in main checkout `git pull --ff-only`, then `pnpm worktree remove <type>-<task>`; unasked
- `pnpm migrate` against Neon: only the `/sweep` coordinator, per its skill; every other agent session forbidden
- migration keeps deployed code working; production runs previous code until merge deploys; failure example: renaming a column the deployed code reads
- output: changes, reasons, tests
