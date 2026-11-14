## Project overview

See [Overview](README.md#overview) in the README.

## Setup

Follow [Installation](README.md#installation) in the README. No environment variables required.

## Commands

See [Run](README.md#run) and [Development](README.md#development) in the README. Run every command through `pnpm`; never install Node.js globally.

## Project structure

See [Project structure](README.md#project-structure) in the README. When adding a test to a `scripts/check-*.js` file, update the header comment that lists what the file checks.

## Code style

- Plain JavaScript; JSDoc types only where inference fails, such as DOM lookup element types. TypeScript strict mode off: most functions lack parameter types.
- Prettier: 120-character lines, single quotes.
- Comments above modules and functions state contract; follow existing pattern.
- Keep DOM-free logic in `js/invite.js` or `js/templates.js` so `scripts/` checks run it in Node.
- Justify each new dependency.

## Testing

Behavior changes: add/update checks in `scripts/`. Checks use `node:test`. Before finishing: run `pnpm test`, `pnpm typecheck` and `pnpm test:browser`; require all passing. NEVER skip/disable/delete failing checks to pass.

## Git

- Worktrees live in `.worktrees/` (gitignored).
- Commit subject: imperative sentence-case reason, no type prefix, e.g. `Run the format check and lint in pnpm test`. Blank line, body: approach rationale + context/constraints/tradeoffs absent from diff. Implementation details: diff only.
- Formatting-only commits: add hash to `.git-blame-ignore-revs`.
- Output: changes, reasons, tests.

## Boundaries

### Always

- Keep fonts and code self-hosted; pages load nothing from external services except Vercel's own `/_vercel/insights/script.js`.

### Never

- Edit `vendor/`; it stays byte-for-byte as published.
- Commit `.env.local` or other `.env.*` files.

### Ask first

- Changing production domain `https://petalpost-beryl.vercel.app`.

## Gotchas

- `serve.json` disables clean URLs so `/editor.html` loads without redirect, rewrites `/` to `index.html` and disables directory listings, matching Vercel.
- CSP blocks inline scripts: put page scripts in files. Inline `style` attributes stay allowed for `renderInvite`.
- Line endings, dependency upgrades and install errors: see [Tooling notes](README.md#tooling-notes) in the README.
- Package store lives in `.pnpm-store/` inside repository.
- `js/analytics.js` is a classic script, not module; ESLint config sets `sourceType: 'script'`.
- New page-level globals from classic scripts need declarations in `js/globals.d.ts` and ESLint globals.
- Pushing `main` releases to production. Run the checks in [Testing](#testing) first. Deployment, security headers, the placeholder contact address and production-origin changes: see [Deployment](README.md#deployment) in the README.
- Add new non-site files to `.vercelignore`.
