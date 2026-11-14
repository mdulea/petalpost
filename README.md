# Petalpost

A static invitation editor built with HTML, CSS, and JavaScript.

## Local development

The project pins its own tools in `package.json`.
`packageManager` pins pnpm, and Corepack downloads that version on first use.
`devEngines.runtime` pins Node.js, and pnpm installs that version into `node_modules/.bin`.
Every `pnpm` script runs on the pinned Node.js, whatever version is installed globally.
`pnpm-workspace.yaml` keeps the package store in `.pnpm-store/` inside the repository.

The only requirement is a global Node.js that ships Corepack, such as Node.js 24.
Run pnpm through Corepack so that nothing is installed globally:

```sh
corepack pnpm install
corepack pnpm dev
corepack pnpm test
```

`dev` serves the repository root at `http://localhost:3000`.
Each page loads its script as an ES module, and browsers refuse modules opened from the file system.
`serve.json` turns off clean URLs so that `/editor.html` loads without a redirect, as it does on Vercel.
The site has no build step, and Vercel deploys no package files.

`test` runs the three checks in `scripts/` and stops at the first failure.

The contrast check covers each template's colors and every accent swatch as rendered on it.
The invite check covers share links, invite records, storage writes, template switching, template ids and the calendar file.
The site check covers the production origin in the pages, `robots.txt` and `sitemap.xml`, the sitemap's list of indexed pages, the footer contact address, an editor control for every invite field and a CSS rule for every template frame and title font.

Fonts live in `fonts/` and the editor's html-to-image library lives in `vendor/`.
No page loads code or fonts from an external service.
No environment variables are required.

All three pages load Vercel Web Analytics through its static-site script.
Enable Web Analytics in the Vercel project dashboard before deploying.

## Search and social previews

Every page has a canonical link, a `robots` tag and Open Graph tags under `https://petalpost-beryl.vercel.app`.
If the production domain changes, update those URLs, `robots.txt` and `sitemap.xml`, then run `corepack pnpm exec node scripts/check-site.js` to find any copy you missed.

`og-image.png` is the 1200 by 630 link preview.
To regenerate it, serve the repository root, open `scripts/og-card.html` and click "Save og-image.png".
Move the downloaded file to the repository root and commit it.

The footer contact link uses the placeholder `hello@example.com`.
Replace it in all three pages before launch, then run `corepack pnpm exec node scripts/check-site.js`.
