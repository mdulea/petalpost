// Fails when share links, invite records, template switching or the calendar file break.
// Run: node scripts/check-invite.js
const fs = require('fs');
const vm = require('vm');
const ctx = { document: {}, TextEncoder, TextDecoder, atob, btoa };
const read = (file) => fs.readFileSync(`${__dirname}/../js/${file}`, 'utf8');
vm.runInNewContext(`${read('templates.js')}\n${read('invite.js')}
this.TEMPLATES = TEMPLATES; this.getTemplate = getTemplate; this.encodeState = encodeState; this.decodeState = decodeState;
this.makeInviteData = makeInviteData; this.switchTemplate = switchTemplate; this.buildIcs = buildIcs;`, ctx);

let failures = 0;
const check = (name, actual, expected) => {
  const [a, e] = [JSON.stringify(actual), JSON.stringify(expected)];
  if (a !== e) { console.log(`${name}\n  expected ${e}\n  got      ${a}`); failures++; }
};

// Share links.
for (const t of ctx.TEMPLATES) {
  const value = { t: t.id, d: t.defaults };
  check(`${t.id} defaults survive a share link`, ctx.decodeState(ctx.encodeState(value)), value);
}
check('non-ASCII text survives a share link',
  ctx.decodeState(ctx.encodeState({ t: 'birthday', d: { message: 'Café, a piñata and 🎂' } })),
  { t: 'birthday', d: { message: 'Café, a piñata and 🎂' } });
check('a link made before this change still decodes',
  ctx.decodeState('eyJ0IjoiYmlydGhkYXkiLCJkIjp7InRpdGxlIjoiQ2Fmw6kgcGnDsWF0YSIsImFjY2VudCI6IiM1MjcwNEMifX0'),
  { t: 'birthday', d: { title: 'Café piñata', accent: '#52704C' } });
for (const bad of ['', '%%%', 'abc', 'bm90IGpzb24']) check(`malformed hash "${bad}" decodes to null`, ctx.decodeState(bad), null);

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
