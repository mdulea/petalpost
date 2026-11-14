// Draws the link preview card for og-card.html; the page saves it as og-image.png.
// An external module, because the Content-Security-Policy that pnpm dev sends blocks inline scripts.
import '../js/icons.js';
import { HERO_TEMPLATES, getTemplate, renderInvite } from '../js/templates.js';
import { mountInvites } from '../js/mount.js';
import { makeInviteData } from '../js/invite.js';

mountInvites(
  document.getElementById('fan'),
  HERO_TEMPLATES.map((id) => renderInvite(getTemplate(id), makeInviteData(getTemplate(id)))).join(''),
);

document.getElementById('save').addEventListener('click', async () => {
  const link = document.createElement('a');
  link.download = 'og-image.png';
  link.href = await htmlToImage.toPng(document.getElementById('card'), { pixelRatio: 1 });
  link.click();
});
