// Draws the link preview card for og-card.html (?lang=ro for Romanian); the page saves it as og-image.png.
// An external module, because the Content-Security-Policy that pnpm dev sends blocks inline scripts.
import '../js/icons.js';
import { localeOf, normalizeLang } from '../js/i18n.js';
import { getTemplate, heroTemplatesFor, renderInvite } from '../js/templates.js';
import { mountInvites } from '../js/mount.js';
import { makeInviteData } from '../js/invite.js';

const lang = normalizeLang(new URLSearchParams(location.search).get('lang') || 'en');
const locale = localeOf(lang);

if (lang === 'ro') {
  document.documentElement.lang = 'ro';
  document.querySelector('#card h1').innerHTML = 'Ziua ta,<br />invitația <em>ta</em>.';
  document.querySelector('#card .lead').textContent =
    'Invitații ilustrate pe care le faci într-un minut și le trimiți printr-un link.';
}

mountInvites(
  document.getElementById('fan'),
  heroTemplatesFor(lang)
    .map((id) => {
      const t = getTemplate(id, lang);
      return renderInvite(t, makeInviteData(t, undefined, lang), { locale });
    })
    .join(''),
);

document.getElementById('save').addEventListener('click', async () => {
  const link = document.createElement('a');
  link.download = 'og-image.png';
  link.href = await htmlToImage.toPng(document.getElementById('card'), { pixelRatio: 1 });
  link.click();
});
