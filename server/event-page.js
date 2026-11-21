// Dynamic HTML route for published invitations at /e/{id}. Serves editor.html with per-event Open Graph metadata
// built from the event's title, date, time and venue, noindex so personal invites stay out of search engines,
// and cache-control: no-store so edits and deletions take effect immediately.
import { readFileSync } from 'node:fs';
import { eventPreviewMeta, makeInviteData } from '../js/invite.js';
import { ID_PATTERN } from '../js/rsvp.js';
import { escapeHtml, getTemplate } from '../js/templates.js';

const DEFAULT_TEMPLATE_HTML = readFileSync(new URL('../editor.html', import.meta.url), 'utf8');

const MISSING_META = {
  pageTitle: 'This invitation does not exist | Petalpost',
  description: 'This invitation does not exist or may have been deleted.',
};

const UNAVAILABLE_META = {
  pageTitle: 'The invitation could not be loaded | Petalpost',
  description: 'Storage is unavailable right now. Try again in a minute.',
};

// Replaces the static editor.html head metadata with per-event Open Graph tags and noindex.
// Reads the production origin from the template's og:url so the site origin has one source of truth.
export function renderEventPage(templateHtml, { id = null, event = null, status = 200 } = {}) {
  const originMatch = templateHtml.match(/<meta\s+property="og:url"\s+content="([^"]+)"\s*\/>/);
  const origin = originMatch ? new URL(originMatch[1]).origin : 'https://www.petalpost.ro';
  let meta;
  if (event) {
    const data = makeInviteData(getTemplate(event.t), event.d);
    meta = eventPreviewMeta(data);
  } else {
    meta = status === 503 ? UNAVAILABLE_META : MISSING_META;
  }
  const url = id ? `${origin}/e/${id}` : `${origin}/editor.html`;
  return templateHtml
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(meta.pageTitle)}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
      () => `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    )
    .replace(/<meta\s+name="robots"\s+content="[^"]*"\s*\/>/, '<meta name="robots" content="noindex, nofollow" />')
    .replace(/\s*<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/, '')
    .replace(
      /<meta\s+property="og:title"\s+content="[^"]*"\s*\/>/,
      () => `<meta property="og:title" content="${escapeHtml(meta.pageTitle)}" />`,
    )
    .replace(
      /<meta\s+property="og:description"\s+content="[^"]*"\s*\/>/,
      () => `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    )
    .replace(
      /<meta\s+property="og:url"\s+content="[^"]*"\s*\/>/,
      () => `<meta property="og:url" content="${escapeHtml(url)}" />`,
    );
}

function htmlResponse(status, html, method) {
  return new Response(method === 'HEAD' ? null : html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// Fetch API handler for /e/{id}. Accepts GET and HEAD; returns 405 for other methods, 404 HTML when the id is
// malformed or the event does not exist, and 503 HTML when storage cannot be reached.
export function createEventPage(db, templateHtml = DEFAULT_TEMPLATE_HTML) {
  return async function handleEventPage(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', allow: 'GET, HEAD' },
      });
    }
    const { pathname } = new URL(request.url);
    const match = pathname.match(/^\/e\/([^/]+)$/);
    const id = match && ID_PATTERN.test(match[1]) ? match[1] : null;
    if (!id) {
      return htmlResponse(404, renderEventPage(templateHtml, { id: null, event: null, status: 404 }), request.method);
    }
    try {
      const event = (await db.query('select t, d from events where id = $1', [id])).rows[0] ?? null;
      const status = event ? 200 : 404;
      return htmlResponse(status, renderEventPage(templateHtml, { id, event, status }), request.method);
    } catch (error) {
      console.error('event page storage error', error?.code ?? 'unknown');
      return htmlResponse(503, renderEventPage(templateHtml, { id, event: null, status: 503 }), request.method);
    }
  };
}
