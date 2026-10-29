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

Both pages load Vercel Web Analytics through its static-site script.
Enable Web Analytics in the Vercel project dashboard before deploying.
