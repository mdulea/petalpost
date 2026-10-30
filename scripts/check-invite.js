// Fails when share links, invite records, template switching or the calendar file break.
// Run: node scripts/check-invite.js
const fs = require('fs');
const vm = require('vm');
const ctx = { TextEncoder, TextDecoder, atob, btoa };
const read = (file) => fs.readFileSync(`${__dirname}/../js/${file}`, 'utf8');
vm.runInNewContext(`${read('templates.js')}\n${read('invite.js')}
this.TEMPLATES = TEMPLATES; this.getTemplate = getTemplate; this.shareLink = shareLink; this.openInvite = openInvite; this.renderInvite = renderInvite;
this.makeInviteData = makeInviteData; this.switchTemplate = switchTemplate; this.buildIcs = buildIcs;`, ctx);

let failures = 0;
const check = (name, actual, expected) => {
  const [a, e] = [JSON.stringify(actual), JSON.stringify(expected)];
  if (a !== e) { console.log(`${name}\n  expected ${e}\n  got      ${a}`); failures++; }
};

// Share links and the load order: a link wins, then the stored draft, then ?t= switches the template.
const BASE = 'https://petalpost.example/editor.html';
const hashOf = (link) => link.slice(link.indexOf('#'));
const fresh = (id) => ({ t: id, d: ctx.makeInviteData(ctx.getTemplate(id)) });
for (const t of ctx.TEMPLATES) {
  check(`${t.id} defaults survive a share link`, ctx.openInvite({ hash: hashOf(ctx.shareLink(BASE, fresh(t.id))) }), { ...fresh(t.id), photo: null });
}
const zoe = { t: 'birthday', d: ctx.makeInviteData(ctx.getTemplate('birthday'), { message: 'Café, a piñata and 🎂', photoY: 20 }) };
const zoeLink = ctx.shareLink(BASE, zoe);
check('a share link opens the guest view of the page', zoeLink.startsWith(`${BASE}?view=1#d=`), true);
check('non-ASCII text survives a share link', ctx.openInvite({ hash: hashOf(zoeLink) }).d.message, 'Café, a piñata and 🎂');
check('a share link leaves out the photo position', ctx.openInvite({ hash: hashOf(zoeLink) }).d.photoY, 50);
check('a link made before this change still opens',
  ctx.openInvite({ hash: '#d=eyJ0IjoiYmlydGhkYXkiLCJkIjp7InRpdGxlIjoiQ2Fmw6kgcGnDsWF0YSIsImFjY2VudCI6IiM1MjcwNEMifX0' }),
  { t: 'birthday', d: ctx.makeInviteData(ctx.getTemplate('birthday'), { title: 'Café piñata', accent: '#52704C' }), photo: null });
for (const bad of ['', '%%%', 'abc', 'bm90IGpzb24']) {
  check(`malformed hash "${bad}" opens a new invite`, ctx.openInvite({ hash: `#d=${bad}`, requested: 'wedding' }), { ...fresh('wedding'), photo: null });
}
const draft = JSON.stringify({ t: 'birthday', d: { title: 'Zoe turns 30' } });
check('a share link wins over the stored draft and photo',
  ctx.openInvite({ hash: hashOf(zoeLink), draft, photo: 'data:image/jpeg;base64,x' }), { ...ctx.openInvite({ hash: hashOf(zoeLink) }) });
const switched = ctx.openInvite({ hash: '', draft, photo: 'data:image/jpeg;base64,x', requested: 'graduation' });
check('?t= switches the stored draft and keeps its edits', [switched.t, switched.d.title, switched.d.venue, switched.photo],
  ['graduation', 'Zoe turns 30', 'The Okafor home', 'data:image/jpeg;base64,x']);
check('an unreadable draft opens a new invite for ?t=', ctx.openInvite({ hash: '', draft: '{', requested: 'baby' }), { ...fresh('baby'), photo: null });

// Invite records.
const birthday = ctx.getTemplate('birthday');
check('a new record is the template sample with centered photo and default accent',
  ctx.makeInviteData(birthday), { ...birthday.defaults, photoY: 50, accent: null });
check('a record keeps string fields, photoY and a known accent',
  ctx.makeInviteData(birthday, { title: 'Zoe turns 30', photoY: '20', accent: '#52704C' }),
  { ...birthday.defaults, title: 'Zoe turns 30', photoY: 20, accent: '#52704C' });
check('a record drops non-string fields, bad photoY and unknown accents',
  ctx.makeInviteData(birthday, { title: 7, photoY: 'top', accent: '#000000', extra: 'x' }),
  { ...birthday.defaults, photoY: 50, accent: null });

// Template switching keeps edits and replaces untouched sample text.
const state = { t: 'birthday', d: ctx.makeInviteData(birthday, { title: 'Zoe turns 30' }) };
ctx.switchTemplate(state, 'graduation');
check('switching templates keeps an edited title', state.d.title, 'Zoe turns 30');
check('switching templates replaces untouched sample text', state.d.venue, 'The Okafor home');
check('switching templates updates the template id', state.t, 'graduation');

// Rendered invites carry their sizing container, which may be a link.
check('an invite renders inside its sizing container', /^<div class="invite-wrap">\s*<article class="invite /.test(ctx.renderInvite(birthday)), true);
check('the sizing container can be a link', /^<a class="invite-wrap" href="editor.html">/.test(ctx.renderInvite(birthday, {}, 'a', 'href="editor.html"')), true);

// Calendar file: events last three hours and may end the next day.
const now = new Date('2026-10-30T09:15:00Z');
const lines = (data) => ctx.buildIcs(data, now).split('\r\n');
const afternoon = lines({ title: 'Mia turns seven', date: '2026-12-12', time: '14:00' });
check('a 14:00 event starts at 14:00', afternoon.find((l) => l.startsWith('DTSTART')), 'DTSTART:20261212T140000');
check('a 14:00 event ends at 17:00', afternoon.find((l) => l.startsWith('DTEND')), 'DTEND:20261212T170000');
check('the stamp is the given time', afternoon.find((l) => l.startsWith('DTSTAMP')), 'DTSTAMP:20261030T091500Z');
const late = lines({ title: 'New year', date: '2026-12-31', time: '23:30' });
check('a 23:30 event ends at 02:30 the next day', late.find((l) => l.startsWith('DTEND')), 'DTEND:20270101T023000');
check('an event without a time starts at noon', lines({ date: '2026-12-12' }).find((l) => l.startsWith('DTSTART')), 'DTSTART:20261212T120000');
check('summary text is escaped',
  lines({ title: 'Tea; cake, games', date: '2026-12-12' }).find((l) => l.startsWith('SUMMARY')), 'SUMMARY:Tea\\; cake\\, games');

console.log(failures ? `${failures} failed` : 'invite checks passed');
process.exit(failures ? 1 : 0);
