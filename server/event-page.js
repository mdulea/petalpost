// Dynamic HTML route for published invitations at /e/{id} and /ro/e/{id}. Serves editor.html or ro/editor.html with
// per-event Open Graph metadata built from the event's title, date, time and venue and its template's link preview
// image, noindex so personal invites stay out of search engines, and cache-control: no-store so edits and deletions take effect immediately.
import { readFileSync } from 'node:fs';
import { localeOf, normalizeLang } from '../public/js/i18n.js';
import { eventPreviewMeta, makeInviteData } from '../public/js/invite.js';
import { ID_PATTERN } from '../public/js/rsvp.js';
import { escapeHtml, getTemplate, linkPreviewPath } from '../public/js/templates.js';
import { isEnded } from './routes/shared.js';

const DEFAULT_TEMPLATES = {
  en: readFileSync(new URL('../public/editor.html', import.meta.url), 'utf8'),
  ro: readFileSync(new URL('../public/ro/editor.html', import.meta.url), 'utf8'),
};

const FALLBACK_META = {
  en: {
    missing: {
      pageTitle: 'This invitation does not exist | Petalpost',
      description: 'This invitation does not exist or may have been deleted.',
    },
    ended: {
      pageTitle: 'This invitation has ended | Petalpost',
      description: 'This invitation has ended.',
    },
    unavailable: {
      pageTitle: 'The invitation could not be loaded | Petalpost',
      description: 'Storage is unavailable right now. Try again in a minute.',
    },
  },
  ro: {
    missing: {
      pageTitle: 'Această invitație nu există | Petalpost',
      description: 'Această invitație nu există sau a fost ștearsă.',
    },
    ended: {
      pageTitle: 'Această invitație s-a încheiat | Petalpost',
      description: 'Această invitație s-a încheiat.',
    },
    unavailable: {
      pageTitle: 'Invitația nu a putut fi încărcată | Petalpost',
      description: 'Stocarea nu este disponibilă acum. Încearcă din nou peste un minut.',
    },
  },
};

// The word that the alt text of a template's link preview image puts after the invitation title.
const INVITATION_WORD = { en: 'invitation', ro: 'invitație' };

// Replaces the static editor HTML head metadata with per-event Open Graph tags and noindex. A found event whose
// template has a link preview image names that image; any other page keeps the generic image of its language.
// Reads the production origin from the template's og:url so the site origin has one source of truth.
export function renderEventPage(templateHtml, { id = null, event = null, status = 200, lang = 'en' } = {}) {
  const code = normalizeLang(lang);
  const originMatch = templateHtml.match(/<meta\s+property="og:url"\s+content="([^"]+)"\s*\/>/);
  const origin = originMatch ? new URL(originMatch[1]).origin : 'https://www.petalpost.ro';
  let meta;
  // The template's link preview image; null keeps the generic image of the page language.
  let image = null;
  if (event) {
    const data = makeInviteData(getTemplate(event.t, code), event.d, code);
    meta = eventPreviewMeta(data, localeOf(code));
    const previewPath = linkPreviewPath(event.t);
    if (previewPath) image = { url: `${origin}/${previewPath}`, alt: `${meta.title} ${INVITATION_WORD[code]}` };
  } else {
    meta =
      status === 503
        ? FALLBACK_META[code].unavailable
        : status === 410
          ? FALLBACK_META[code].ended
          : FALLBACK_META[code].missing;
  }
  const prefix = code === 'ro' ? '/ro' : '';
  const url = id ? `${origin}${prefix}/e/${id}` : `${origin}${prefix}/editor.html`;
  const html = templateHtml
    .replace(/<title>[^<]*<\/title>/, () => `<title>${escapeHtml(meta.pageTitle)}</title>`)
    .replace(
      /<meta\s+name="description"\s+content="[^"]*"\s*\/>/,
      () => `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    )
    .replace(/<meta\s+name="robots"\s+content="[^"]*"\s*\/>/, '<meta name="robots" content="noindex, nofollow" />')
    .replace(/\s*<link\s+rel="canonical"\s+href="[^"]*"\s*\/>/, '')
    .replace(/\s*<!-- generated:hreflang -->[\s\S]*?<!-- \/generated:hreflang -->/, '')
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
  if (!image) return html;
  return html
    .replace(
      /<meta\s+property="og:image"\s+content="[^"]*"\s*\/>/,
      () => `<meta property="og:image" content="${escapeHtml(image.url)}" />`,
    )
    .replace(
      /<meta\s+property="og:image:alt"\s+content="[^"]*"\s*\/>/,
      () => `<meta property="og:image:alt" content="${escapeHtml(image.alt)}" />`,
    );
}

function htmlResponse(status, html, method) {
  return new Response(method === 'HEAD' ? null : html, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  });
}

// Fetch API handler for /e/{id} and /ro/e/{id}. Accepts GET and HEAD; returns 405 for other methods, 404 HTML when the
// id is malformed or the event does not exist, and 503 HTML when storage cannot be reached.
export function createEventPage(db, templates = DEFAULT_TEMPLATES) {
  const byLang = typeof templates === 'string' ? { en: templates, ro: templates } : templates;
  return async function handleEventPage(request) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', allow: 'GET, HEAD' },
      });
    }
    const { pathname } = new URL(request.url);
    const lang = pathname.startsWith('/ro/e/') ? 'ro' : 'en';
    const templateHtml = byLang[lang];
    const match = pathname.match(/^(?:\/ro)?\/e\/([^/]+)$/);
    const id = match && ID_PATTERN.test(match[1]) ? match[1] : null;
    if (!id) {
      return htmlResponse(
        404,
        renderEventPage(templateHtml, { id: null, event: null, status: 404, lang }),
        request.method,
      );
    }
    try {
      const event = (await db.query('select t, d from events where id = $1', [id])).rows[0] ?? null;
      const ended = !event && (await isEnded(db, id));
      const status = event ? 200 : ended ? 410 : 404;
      return htmlResponse(status, renderEventPage(templateHtml, { id, event, status, lang }), request.method);
    } catch (error) {
      console.error('event page storage error', error?.code ?? 'unknown');
      return htmlResponse(503, renderEventPage(templateHtml, { id, event: null, status: 503, lang }), request.method);
    }
  };
}
