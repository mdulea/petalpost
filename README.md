# Petalpost

A static invitation editor built with HTML, CSS, and JavaScript.

## Local development

Serve the repository root with any static HTTP server, then open `index.html`.
The site has no build step or package dependencies.

Run the template contrast check with Node.js:

```sh
node scripts/check-contrast.js
```

Google Fonts and the editor's html2canvas library load from external services.
No environment variables are required.

## Publish on Vercel

1. Create the first commit and push the `main` branch to `origin`.
2. Open https://vercel.com/new and import `mdulea/petalpost` from GitHub.
3. Choose the Other framework preset and leave the root directory at the repository root.
4. Keep the settings from `vercel.json`. It disables installation and building and serves the repository root.
5. Deploy and confirm that the production branch is `main` in the project's Git settings.
6. Open the home page and `editor.html`. Check template selection, a shared invitation link, and PNG download.

After import, pushes to `main` deploy to production. Other branches and pull requests receive preview deployments.
See the [Vercel Git documentation](https://vercel.com/docs/git).

`.gitignore` excludes local caches, environment files, and Vercel project metadata.
`.vercelignore` also excludes development scripts and this README from deployment uploads.
