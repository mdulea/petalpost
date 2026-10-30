# Petalpost

A static invitation editor built with HTML, CSS, and JavaScript.

## Local development

Serve the repository root with any static HTTP server, then open `index.html`.
The site has no build step or package dependencies.

Run the template contrast check with Node.js:

```sh
node scripts/check-contrast.js
```

Fonts live in `fonts/` and the editor's html-to-image library lives in `vendor/`.
No page loads code or fonts from an external service.
No environment variables are required.

All three pages load Vercel Web Analytics through its static-site script.
Enable Web Analytics in the Vercel project dashboard before deploying.

## Search and social previews

Every page has a canonical link, a `robots` tag and Open Graph tags under `https://petalpost-beryl.vercel.app`.
Update those URLs, `robots.txt` and `sitemap.xml` if the production domain changes.

`og-image.png` is the 1200 by 630 link preview.
To regenerate it, serve the repository root, open `scripts/og-card.html` and click "Save og-image.png".
Move the downloaded file to the repository root and commit it.

The footer contact link uses the placeholder `hello@example.com`.
Replace it in all three pages before launch.
