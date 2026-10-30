# Petalpost

A static invitation editor built with HTML, CSS, and JavaScript.

## Local development

Serve the repository root with any static HTTP server, then open `index.html`.
Each page loads its script as an ES module, and browsers refuse modules opened from the file system.
The site has no build step or package dependencies.

Run the checks with Node.js 20.19, 22.7 or later.
These versions load the checks and `js/` as ES modules from their `import` and `export` syntax, without a `package.json`:

```sh
node scripts/check-contrast.js
node scripts/check-invite.js
node scripts/check-site.js
```

The contrast check covers each template's colors and every accent swatch as rendered on it.
The invite check covers share links, invite records, template switching, template ids and the calendar file.
The site check covers the production origin in the pages, `robots.txt` and `sitemap.xml`, the sitemap's list of indexed pages and the footer contact address.

Fonts live in `fonts/` and the editor's html-to-image library lives in `vendor/`.
No page loads code or fonts from an external service.
No environment variables are required.

All three pages load Vercel Web Analytics through its static-site script.
Enable Web Analytics in the Vercel project dashboard before deploying.

## Search and social previews

Every page has a canonical link, a `robots` tag and Open Graph tags under `https://petalpost-beryl.vercel.app`.
If the production domain changes, update those URLs, `robots.txt` and `sitemap.xml`, then run `node scripts/check-site.js` to find any copy you missed.

`og-image.png` is the 1200 by 630 link preview.
To regenerate it, serve the repository root, open `scripts/og-card.html` and click "Save og-image.png".
Move the downloaded file to the repository root and commit it.

The footer contact link uses the placeholder `hello@example.com`.
Replace it in all three pages before launch, then run `node scripts/check-site.js`.
