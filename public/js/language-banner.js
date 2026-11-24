// Browser-only: puts the Romanian language banner above the site header when romanianBannerHref in i18n.js allows it.
// Every English page's entry module imports it. Closing the banner hides it on every page; when the browser blocks
// storage, it hides it on the current page only.
import { pageLang, romanianBannerHref } from './i18n.js';

const CLOSED_KEY = 'petalpost:ro-banner-closed';

// Reading localStorage throws when the browser blocks storage, and so can each read and write.
function closedStorage() {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

function isClosed(storage) {
  try {
    return storage?.getItem(CLOSED_KEY) === '1';
  } catch {
    return false;
  }
}

function rememberClosed(storage) {
  try {
    storage?.setItem(CLOSED_KEY, '1');
  } catch {
    // The banner then stays closed until the next page load.
  }
}

const storage = closedStorage();
const href = romanianBannerHref({
  lang: pageLang(),
  languages: navigator.languages?.length ? navigator.languages : [navigator.language],
  alternate: document.querySelector('link[rel="alternate"][hreflang="ro"]')?.getAttribute('href') ?? null,
  closed: isClosed(storage),
});
const header = document.querySelector('.site-header');

if (href && header) {
  const banner = document.createElement('aside');
  banner.className = 'lang-banner';
  banner.lang = 'ro';
  banner.setAttribute('aria-label', 'Limba paginii');
  banner.innerHTML = `<p>Această pagină este disponibilă și în română.</p>
    <a class="pill pill-cta" href="${href}" hreflang="ro">Deschide în română</a>
    <button class="pill" type="button">Închide</button>`;
  banner.querySelector('button').addEventListener('click', () => {
    rememberClosed(storage);
    banner.remove();
  });
  header.before(banner);
}
