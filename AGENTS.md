## Project overview

Petalpost is a static invitation editor: pick template, edit invite, download PNG or copy share link. Plain HTML, CSS and JavaScript ES modules, no build step, no backend, deployed on Vercel. Code in `js/`; pages at repository root.

## Setup

```bash
pnpm install
git config blame.ignoreRevsFile .git-blame-ignore-revs
```

No environment variables required.

## Commands

| Task            | Command                                  |
| --------------- | ---------------------------------------- |
| Install         | `pnpm install`                           |
| Run locally     | `pnpm dev`                               |
| Test (all)      | `pnpm test`                              |
| Test (one file) | `pnpm exec node scripts/check-invite.js` |
| Lint            | `pnpm lint`                              |
| Format          | `pnpm format`                            |
| Format check    | `pnpm format:check`                      |
| Type check      | `pnpm typecheck`                         |

Run every command through `pnpm`; never install Node.js globally. `dev` serves `http://localhost:3000`. Test (one file) works for each `scripts/check-*.js`.

## Project structure

- `index.html` landing, `editor.html` editor, `privacy.html`, `404.html`.
- `js/templates.js`: template catalog, `renderInvite`. `js/invite.js`: invite records, share links, storage policy, calendar file; no DOM access, so Node tests import it. `js/mount.js`: browser-only invite mounting and text fitting. `js/editor.js`, `js/landing.js`: page entry modules. `js/icons.js`: inline SVG sprite. `js/analytics.js`: classic script for Vercel Web Analytics queue. `js/globals.d.ts`: types for `htmlToImage` and analytics queue globals.
- `scripts/check-contrast.js`: WCAG AA contrast of template text colors and accent swatches. `scripts/check-invite.js`: share links, invite records, storage writes, template switching, template ids, calendar file. `scripts/check-site.js`: production origin across pages, `robots.txt`, `sitemap.xml`; sitemap coverage; favicons; contact address; editor control per invite field; CSS rule per template frame and title font; self-referencing custom properties; `index.html` counts. `scripts/og-card.html`: generates `og-image.png`.
- `css/`, `fonts/` (self-hosted), `vendor/html-to-image.js`, `docs/petalpost-flow.html` (flow diagram).

## Code style

- Plain JavaScript; JSDoc types only where inference fails, such as DOM lookup element types. TypeScript strict mode off: most functions lack parameter types.
- Prettier: 120-character lines, single quotes.
- Comments above modules and functions state contract; follow existing pattern.
- Keep DOM-free logic in `js/invite.js` or `js/templates.js` so `scripts/` checks run it in Node.
- Justify each new dependency.

## Testing

Behavior changes: add/update checks in `scripts/`. Before finishing: run `pnpm test` and `pnpm typecheck`; require all passing. NEVER skip/disable/delete failing checks to pass.

## Git

- Worktrees live in `worktrees/` (gitignored).
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

- `pnpm test` skips typecheck; run `pnpm typecheck` separately.
- Pages load ES modules; opening HTML from file system fails. Use `pnpm dev`.
- `serve.json` disables clean URLs so `/editor.html` loads without redirect, matching Vercel.
- `.gitattributes` forces LF; CRLF checkout makes `format:check` fail on every file.
- Prettier pinned to 3.9.10: newer releases are younger than pnpm's minimum release age.
- `pnpm-workspace.yaml` denies esbuild build script; pnpm 12 otherwise fails install with `ERR_PNPM_IGNORED_BUILDS`.
- Package store lives in `.pnpm-store/` inside repository.
- `js/analytics.js` is a classic script, not module; ESLint config sets `sourceType: 'script'`.
- New page-level globals from classic scripts need declarations in `js/globals.d.ts` and ESLint globals.
- Vercel GitHub integration deploys every push to `main` to production; other branches get preview deployments. Pushing `main` == releasing.
- `.vercelignore` excludes `AGENTS.md`, `README.md`, `scripts/`, `docs/` and tooling; add new non-site files there.
- Footer contact `hello@example.com` is placeholder; must match across all four pages (`check-site.js`).
- Changing production origin: update canonical, Open Graph, `robots.txt`, `sitemap.xml`; run `pnpm exec node scripts/check-site.js`.
