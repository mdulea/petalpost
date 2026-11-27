// Entrypoint for editor.html and ro/editor.html. Inspects whether the page opened in host-editor mode or guest-view
// mode and initializes only the matching module so guest visits skip host setup and template gallery rendering.
import './icons.js';
import './language-banner.js';
import { initGuestView } from './guest-view.js';
import { initHostEditor } from './host-editor.js';
import { localeOf, normalizeLang } from './i18n.js';
import { openInvite, storedInvite } from './invite.js';

const lang = normalizeLang(document.documentElement.lang);
const locale = lang === 'ro' ? localeOf('ro') : undefined;

// Reading localStorage throws when the browser blocks storage; null storage then keeps nothing.
let storage;
try {
  storage = localStorage;
} catch {
  storage = null;
}

const state = openInvite({
  pathname: location.pathname,
  search: location.search,
  hash: location.hash,
  ...storedInvite(storage, lang),
  lang,
});

if (state.guest) initGuestView({ state, lang, locale });
else initHostEditor({ state, storage, lang, locale });
