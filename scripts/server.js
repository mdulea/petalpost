// The local server for pnpm dev and the browser checks, in place of Vercel. It serves the files in public/ that buildSite
// copies, with the vercel.json headers on every path and its redirects, / as index.html, no clean URLs, no directory
// listing and 404.html with status 404 for anything else, and never a file or directory whose name starts with a dot.
// /api paths go to createApi and /e paths go to createEventPage over PGlite after migrate. PGlite runs in memory with --memory and in .pglite/ otherwise.
// startServer resolves {url, close} once it listens; check-site.js compares its answers with production.
// On a port that another program holds, startServer closes the database and rejects with code EADDRINUSE and a
// message that names the port and PORT_ENV. The command prints that message and exits with status 1.
// Run: pnpm exec node scripts/server.js --port <n> [--memory]
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { PGlite } from '@electric-sql/pglite';
import { createApi } from '../server/api.js';
import { createEventPage } from '../server/event-page.js';
import { migrate } from '../server/migrate.js';
import { PORT_ENV } from './browser-port.js';
import { SITE } from './build.js';

const root = fileURLToPath(new URL('..', import.meta.url));

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

// Each vercel.json rule source, such as /(.*), is a regular expression over the whole path.
const VERCEL = JSON.parse(await readFile(join(root, 'vercel.json'), 'utf8'));
const RULES = VERCEL.headers.map((rule) => ({ pattern: new RegExp(`^${rule.source}$`), headers: rule.headers }));
const REDIRECTS = VERCEL.redirects.map((rule) => ({ ...rule, pattern: new RegExp(`^${rule.source}$`) }));

// The social card generator is a local tool that Vercel never serves. It is served here in addition to the site
// files, because the README steps for og-image.png and the browser checks open it from this server.
const LOCAL_TOOLS = ['scripts/og-card.html', 'scripts/og-card.js'];

// The file a static path names, or null. A local tool path names its file in the repository, and any other path
// names a file in public/. A path that leaves its directory or has a dot segment names no file.
async function staticFile(pathname) {
  let path;
  try {
    path = decodeURIComponent(pathname.endsWith('/') ? `${pathname}index.html` : pathname);
  } catch {
    return null;
  }
  const segments = path.split(/[/\\]/).slice(1);
  if (segments.some((s) => s.startsWith('.'))) return null;
  const dir = LOCAL_TOOLS.includes(segments.join('/')) ? root : SITE;
  const file = join(dir, ...segments);
  if (!file.startsWith(dir.endsWith(sep) ? dir : dir + sep)) return null;
  const info = await stat(file).catch(() => null);
  return info?.isFile() ? file : null;
}

// A Node request as a Fetch API Request, with x-real-ip set from the socket as Vercel sets it.
async function toRequest(req, url) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
  }
  headers.set('x-real-ip', req.socket.remoteAddress ?? 'unknown');
  const body = req.method === 'GET' || req.method === 'HEAD' ? undefined : Buffer.concat(await Array.fromAsync(req));
  return new Request(url, { method: req.method, headers, body });
}

/** @param {{port: number, memory?: boolean, dailyEvents?: number}} options */
export async function startServer({ port, memory = false, dailyEvents }) {
  const db = memory ? new PGlite() : new PGlite(join(root, '.pglite'));
  await migrate(db);
  const api = createApi(db, dailyEvents ? { dailyEvents } : undefined);
  const eventPage = createEventPage(db);

  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const headers = {};
    for (const rule of RULES.filter((r) => r.pattern.test(url.pathname))) {
      for (const { key, value } of rule.headers) headers[key] = value;
    }
    const isEventPage = url.pathname.startsWith('/e/') || url.pathname.startsWith('/ro/e/');
    if (url.pathname.startsWith('/api/') || isEventPage) {
      const handler = isEventPage ? eventPage : api;
      const response = await handler(await toRequest(req, url));
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      res.writeHead(response.status, headers);
      res.end(req.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
      return;
    }
    // Vercel keeps the query string on a redirect.
    const redirect = REDIRECTS.find((r) => r.pattern.test(url.pathname));
    if (redirect) {
      res.writeHead(redirect.statusCode, { ...headers, location: redirect.destination + url.search });
      res.end();
      return;
    }
    const file = await staticFile(url.pathname);
    const status = file ? 200 : 404;
    const path = file ?? join(SITE, '404.html');
    headers['content-type'] = TYPES[extname(path)] ?? 'application/octet-stream';
    res.writeHead(status, headers);
    res.end(req.method === 'HEAD' ? undefined : await readFile(path));
  });

  try {
    await new Promise((done, fail) => {
      server.once('error', fail);
      server.listen(port, 'localhost', () => {
        server.off('error', fail);
        done(undefined);
      });
    });
  } catch (error) {
    await db.close();
    if (error.code !== 'EADDRINUSE') throw error;
    const message = `Another program uses port ${port}. Stop it, or set ${PORT_ENV} to run the browser checks on another port.`;
    throw Object.assign(new Error(message, { cause: error }), { code: 'EADDRINUSE' });
  }
  const address = /** @type {import('node:net').AddressInfo} */ (server.address());
  return {
    url: `http://localhost:${address.port}/`,
    async close() {
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
      await db.close();
    },
  };
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: { port: { type: 'string' }, memory: { type: 'boolean' }, 'daily-events': { type: 'string' } },
  });
  const dailyEvents = values['daily-events'] ? Number(values['daily-events']) : undefined;
  try {
    const { url } = await startServer({ port: Number(values.port ?? 3000), memory: values.memory, dailyEvents });
    console.log(`Petalpost at ${url}`);
  } catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    console.error(error.message);
    process.exitCode = 1;
  }
}
