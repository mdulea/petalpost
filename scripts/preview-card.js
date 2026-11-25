// Draws the link preview of the template that ?t= names for preview-card.html: the template's art in its frame on the
// template's background color, with the Petalpost wordmark and no other text, so one image serves both languages.
// It uses the template's own colors, never an accent choice or a photo. Sets data-ready on #card once drawn.
// The imports are relative to its URL, /scripts/preview-card.js, so ../js/ is public/js/, as in og-card.js.
import { getTemplate, inviteColors } from '../js/templates.js';

const template = getTemplate(new URLSearchParams(location.search).get('t'));
const c = inviteColors(template, undefined);
const card = document.getElementById('card');
card.style.cssText = `--i-bg:${c.bg};--i-ink:${c.ink};--i-accent:${c.accent};--i-soft:${c.soft}`;
document.getElementById('art').innerHTML = `<div class="invite-frame frame-${template.frame}">${template.art}</div>`;
card.dataset.ready = template.id;
