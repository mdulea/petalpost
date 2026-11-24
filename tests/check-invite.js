// Fails when share links, sample guest mode, invitation links and /e/<id> or /ro/e/<id> paths of published events,
// link preview metadata, invite records, storage writes, the stored published event identity, template switching,
// template ids, Romanian localization coverage, the Romanian occasion order, Romanian-only occasions kept out of the English
// catalog, 24-hour time formatting, the calendar file, the report link or the choice of when the Romanian language banner
// shows and where it links break.
// Run: node tests/check-invite.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as templates from '../public/js/templates.js';
import * as invite from '../public/js/invite.js';
import { romanianBannerHref } from '../public/js/i18n.js';

const ctx = { ...templates, ...invite };

// Compares JSON at call time, because later steps change the records under test.
const check = (name, actual, expected) => {
  const [a, e] = [JSON.stringify(actual), JSON.stringify(expected)];
  test(name, () => assert.equal(a, e));
};

// Share links and the load order: a link wins, then the stored draft, then ?t= switches the template.
const BASE = 'https://petalpost.example/editor.html';
const hashOf = (link) => link.slice(link.indexOf('#'));
const searchOf = (link) => link.slice(link.indexOf('?')).split('#')[0];
const fresh = (id) => ({ t: id, d: ctx.makeInviteData(ctx.getTemplate(id)) });
for (const t of ctx.TEMPLATES) {
  check(`${t.id} defaults survive a share link`, ctx.openInvite({ hash: hashOf(ctx.shareLink(BASE, fresh(t.id))) }), {
    ...fresh(t.id),
    photo: null,
    guest: false,
    sample: false,
    broken: false,
    event: null,
    publishedEvent: null,
  });
}
const zoe = {
  t: 'birthday',
  d: ctx.makeInviteData(ctx.getTemplate('birthday'), { message: 'Café, a piñata and 🎂', photoY: 20 }),
};
const zoeLink = ctx.shareLink(BASE, zoe);
check('a share link opens the guest view of the page', zoeLink.startsWith(`${BASE}?view=1#d=`), true);
check(
  'non-ASCII text survives a share link',
  ctx.openInvite({ hash: hashOf(zoeLink) }).d.message,
  'Café, a piñata and 🎂',
);
const opened = ctx.openInvite({ search: searchOf(zoeLink), hash: hashOf(zoeLink) });
check('a share link opens as a guest', [opened.guest, opened.d.message], [true, 'Café, a piñata and 🎂']);
check(
  'an editor link opens its template for the owner',
  [ctx.openInvite({ search: searchOf(ctx.editorUrl('wedding')) })].map((s) => [s.t, s.guest])[0],
  ['wedding', false],
);
check('a share link leaves out the photo position', ctx.openInvite({ hash: hashOf(zoeLink) }).d.photoY, 50);
check(
  'a link made before this change still opens',
  ctx.openInvite({
    hash: '#d=eyJ0IjoiYmlydGhkYXkiLCJkIjp7InRpdGxlIjoiQ2Fmw6kgcGnDsWF0YSIsImFjY2VudCI6IiM1MjcwNEMifX0',
  }),
  {
    t: 'birthday',
    d: ctx.makeInviteData(ctx.getTemplate('birthday'), { title: 'Café piñata', accent: '#52704C' }),
    photo: null,
    guest: false,
    sample: false,
    broken: false,
    event: null,
    publishedEvent: null,
  },
);
for (const bad of ['', '%%%', 'abc', 'bm90IGpzb24']) {
  check(`malformed hash "${bad}" opens a new invite`, ctx.openInvite({ hash: `#d=${bad}`, search: '?t=wedding' }), {
    ...fresh('wedding'),
    photo: null,
    guest: false,
    sample: false,
    broken: false,
    event: null,
    publishedEvent: null,
  });
}
const draft = JSON.stringify({ t: 'birthday', d: { title: 'Zoe turns 30' } });
check(
  'a share link wins over the stored draft and photo',
  ctx.openInvite({ hash: hashOf(zoeLink), draft, photo: 'data:image/jpeg;base64,x' }),
  { ...ctx.openInvite({ hash: hashOf(zoeLink) }) },
);
const switched = ctx.openInvite({ hash: '', draft, photo: 'data:image/jpeg;base64,x', search: '?t=graduation' });
check(
  '?t= switches the stored draft and keeps its edits',
  [switched.t, switched.d.title, switched.d.venue, switched.photo],
  ['graduation', 'Zoe turns 30', 'The Okafor home', 'data:image/jpeg;base64,x'],
);
check('a stored draft reopens as the same record', ctx.openInvite({ draft: ctx.draftOf(zoe) }), {
  ...zoe,
  photo: null,
  guest: false,
  sample: false,
  broken: false,
  event: null,
  publishedEvent: null,
});
for (const bad of [
  'javascript:x',
  "data:image/jpeg;base64,x');background:url('https://evil.test/",
  'data:image/svg+xml;base64,PHN2Zz4',
  'https://evil.test/a.jpg',
]) {
  check(
    `a stored photo "${bad.slice(0, 24)}" that is not a JPEG or PNG data URL is dropped`,
    ctx.openInvite({ photo: bad }).photo,
    null,
  );
}
check(
  'a stored PNG data URL is kept',
  ctx.openInvite({ photo: 'data:image/png;base64,iVBORw0KGgo=' }).photo,
  'data:image/png;base64,iVBORw0KGgo=',
);
// A messaging app can cut a long share link; the guest must not see the sample or this browser's own draft as the invite.
const cut = hashOf(zoeLink).slice(0, 40);
for (const hash of [cut, '#d=%%%', '']) {
  check(
    `a guest link with hash "${hash.slice(0, 12)}" opens as broken, without the stored draft or photo`,
    ctx.openInvite({ search: '?view=1', hash, draft, photo: 'data:image/jpeg;base64,x' }),
    { ...fresh('birthday'), photo: null, guest: true, sample: false, broken: true, event: null, publishedEvent: null },
  );
}
check('a share link opens as not broken', opened.broken, false);
check('an unreadable draft opens a new invite for ?t=', ctx.openInvite({ hash: '', draft: '{', search: '?t=baby' }), {
  ...fresh('baby'),
  photo: null,
  guest: false,
  sample: false,
  broken: false,
  event: null,
  publishedEvent: null,
});

// Invite records.
const birthday = ctx.getTemplate('birthday');
check(
  'a draft with an impossible month retains the template date',
  ctx.openInvite({ draft: '{"t":"birthday","d":{"date":"2026-99-99","title":"Zoe turns 30"}}' }).d,
  { ...birthday.defaults, title: 'Zoe turns 30', photoY: 50, accent: null },
);
check('a new record is the template sample with centered photo and default accent', ctx.makeInviteData(birthday), {
  ...birthday.defaults,
  photoY: 50,
  accent: null,
});
check(
  'a record keeps string fields, photoY and a known accent',
  ctx.makeInviteData(birthday, { title: 'Zoe turns 30', photoY: '20', accent: '#52704C' }),
  { ...birthday.defaults, title: 'Zoe turns 30', photoY: 20, accent: '#52704C' },
);
check(
  'a record drops non-string fields, bad photoY and unknown accents',
  ctx.makeInviteData(birthday, { title: 7, photoY: 'top', accent: '#000000', extra: 'x' }),
  { ...birthday.defaults, photoY: 50, accent: null },
);

const long = 'x'.repeat(500);
check(
  'an over-long title in a share link is cut to its limit',
  ctx.openInvite({ hash: hashOf(ctx.shareLink(BASE, { t: 'birthday', d: { ...birthday.defaults, title: long } })) }).d
    .title,
  long.slice(0, ctx.FIELD_LIMITS.title),
);
check(
  'every template sample fits its limits',
  ctx.TEMPLATES.flatMap((t) =>
    Object.entries(ctx.FIELD_LIMITS)
      .filter(([f, max]) => max && (t.defaults[f] || '').length > max)
      .map(([f]) => `${t.id}.${f}`),
  ),
  [],
);
check(
  'a record holds exactly the editable names',
  Object.keys(ctx.makeInviteData(birthday)).sort(),
  [...ctx.EDITABLE].sort(),
);

// Date and time keep the editor input formats, YYYY-MM-DD and HH:MM. Anything else is the template sample; a cleared input stays empty.
const linked = (d) =>
  ctx.openInvite({ hash: hashOf(ctx.shareLink(BASE, { t: 'birthday', d: { ...birthday.defaults, ...d } })) }).d;
check(
  'a share link with an unreadable time shows the template time',
  linked({ time: 'abc' }).time,
  birthday.defaults.time,
);
check(
  'a share link with an unreadable time renders no invalid time',
  ctx.renderInvite(birthday, linked({ time: 'abc' })).includes('Invalid'),
  false,
);
for (const bad of ['abc', '2026-02-31', '2026-12-12T10:00']) {
  check(
    `a share link with the date "${bad}" shows the template date`,
    linked({ date: bad }).date,
    birthday.defaults.date,
  );
}
check(
  'a share link with month zero retains the template date',
  ctx.openInvite({ hash: '#d=eyJ0IjoiYmlydGhkYXkiLCJkIjp7ImRhdGUiOiIyMDI2LTAwLTAxIiwidGl0bGUiOiJab2UgdHVybnMgMzAifX0' })
    .d,
  { ...birthday.defaults, title: 'Zoe turns 30', photoY: 50, accent: null },
);
check(
  'a share link with a cleared date and time keeps them empty',
  [linked({ date: '', time: '' }).date, linked({ date: '', time: '' }).time],
  ['', ''],
);

// Template switching keeps edits and replaces untouched sample text.
const state = { t: 'birthday', d: ctx.makeInviteData(birthday, { title: 'Zoe turns 30' }) };
ctx.switchTemplate(state, 'graduation');
check('switching templates keeps an edited title', state.d.title, 'Zoe turns 30');
check('switching templates replaces untouched sample text', state.d.venue, 'The Okafor home');
check('switching templates updates the template id', state.t, 'graduation');
const cleared = { t: 'birthday', d: ctx.makeInviteData(birthday, { venue: '', date: '' }) };
ctx.switchTemplate(cleared, 'graduation');
check('switching templates keeps a cleared field empty', [cleared.d.venue, cleared.d.date], ['', '']);
check(
  'switching templates keeps the record shape',
  Object.keys(cleared.d),
  Object.keys(ctx.makeInviteData(ctx.getTemplate('graduation'))),
);
const clearedDraft = ctx.draftOf({ t: 'birthday', d: ctx.makeInviteData(birthday, { hosts: '' }) });
check(
  'a draft opened with ?t= keeps a cleared field empty',
  ctx.openInvite({ search: '?t=graduation', draft: clearedDraft }).d.hosts,
  '',
);

// Editor input goes through the record rules; a cleared field stays cleared.
const typed = { t: 'birthday', d: ctx.makeInviteData(birthday) };
check(
  'typing into a field updates it',
  [ctx.updateInvite(typed, 'title', 'Zoe turns 30'), typed.d.title],
  [true, 'Zoe turns 30'],
);
check('clearing a field keeps it empty', [ctx.updateInvite(typed, 'venue', ''), typed.d.venue], [true, '']);
check('the photo slider stores a number', [ctx.updateInvite(typed, 'photoY', '20'), typed.d.photoY], [true, 20]);
check(
  'a photo position outside the slider range stops at its end',
  [-5, 500].map((photoY) => ctx.makeInviteData(birthday, { photoY }).photoY),
  [0, 100],
);
check(
  'a known accent is kept and the default accent is null',
  [ctx.updateInvite(typed, 'accent', '#52704C'), typed.d.accent, ctx.updateInvite(typed, 'accent', ''), typed.d.accent],
  [true, '#52704C', true, null],
);
check(
  'an unknown accent falls back to the template accent',
  [ctx.updateInvite(typed, 'accent', '#000000'), typed.d.accent],
  [true, null],
);
check(
  'an unknown field changes nothing',
  [ctx.updateInvite(typed, 'photo', 'x'), typed.d.photo, typed.d.title],
  [false, undefined, 'Zoe turns 30'],
);

const edited = {
  t: 'birthday',
  d: ctx.makeInviteData(birthday, { title: 'Zoe turns 30', photoY: 20, accent: '#52704C' }),
  photo: 'data:image/jpeg;base64,x',
};
ctx.resetInvite(edited);
check('reset restores the sample text, keeps the photo position and photo, and clears the accent', edited, {
  t: 'birthday',
  d: { ...ctx.makeInviteData(birthday), photoY: 20 },
  photo: 'data:image/jpeg;base64,x',
});

// Storage: the owner's draft and photo survive a reload; the guest view never writes.
// memory() has the localStorage shape and refuses values longer than limit, as a full localStorage does.
const memory = (limit = Infinity) => {
  const items = new Map();
  return {
    items,
    getItem: (k) => items.get(k) ?? null,
    setItem: (k, v) => {
      if (String(v).length > limit) throw new Error('QuotaExceededError');
      items.set(k, String(v));
    },
    removeItem: (k) => {
      items.delete(k);
    },
  };
};
const owner = { ...ctx.openInvite({ hash: hashOf(zoeLink) }), guest: false, photo: null };
const guestStore = memory();
const guest = { ...owner, guest: true };
ctx.saveDraft(guest, guestStore);
check(
  'the guest view writes nothing',
  [await ctx.changePhoto(guest, 'data:image/jpeg;base64,x', guestStore), guestStore.items.size],
  ['saved', 0],
);
const ownerStore = memory();
ctx.saveDraft(owner, ownerStore);
check(
  'a JPEG data URL becomes the photo and survives a reload',
  [
    await ctx.changePhoto(owner, 'data:image/jpeg;base64,x', ownerStore),
    owner.photo,
    ctx.openInvite(ctx.storedInvite(ownerStore)),
  ],
  ['saved', 'data:image/jpeg;base64,x', owner],
);
check(
  'the export of an empty canvas is refused and the photo stays',
  [await ctx.changePhoto(owner, 'data:,', ownerStore), owner.photo, ctx.storedInvite(ownerStore).photo],
  ['refused', 'data:image/jpeg;base64,x', 'data:image/jpeg;base64,x'],
);
const fullStore = memory(40);
const full = { ...owner, photo: null };
await ctx.changePhoto(full, 'data:image/jpeg;base64,x', fullStore);
const big = `data:image/jpeg;base64,${'x'.repeat(40)}`;
check(
  'a photo that does not fit is shown but removes the stored one',
  [await ctx.changePhoto(full, big, fullStore), full.photo, ctx.storedInvite(fullStore).photo],
  ['unsaved', big, null],
);
check(
  'removing the photo removes the stored one',
  [await ctx.changePhoto(owner, null, ownerStore), owner.photo, ctx.storedInvite(ownerStore).photo],
  ['saved', null, null],
);

// Published events: an invitation link opens the event as a guest; the owner's browser keeps the event identity
// {id, secret, version} under its own key, and the guest view never reads or writes it.
const EVENT_ID = 'AAAAAAAAAAAAAAAAAAAAAA';
const identity = { id: EVENT_ID, secret: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ-_01234', version: 3 };
const stored = JSON.stringify(identity);
check(
  'an /e/<id> invitation link opens its event as a guest, without the stored draft, photo or event identity',
  ctx.openInvite({
    pathname: ctx.eventLink('', EVENT_ID),
    draft,
    photo: 'data:image/jpeg;base64,x',
    publishedEvent: stored,
  }),
  {
    ...fresh('birthday'),
    photo: null,
    guest: true,
    sample: false,
    broken: false,
    event: EVENT_ID,
    publishedEvent: null,
  },
);
// Sample guest mode: ?view=1&sample=1 renders the requested or default template without owner state or server events.
check(
  'sample guest mode loads the default template and ignores stored owner state and event id',
  ctx.openInvite({
    search: `?view=1&sample=1&e=${EVENT_ID}`,
    draft,
    photo: 'data:image/jpeg;base64,x',
    publishedEvent: stored,
  }),
  { ...fresh('birthday'), photo: null, guest: true, sample: true, broken: false, event: null, publishedEvent: null },
);
check(
  'sample guest mode accepts an optional ?t= template override',
  ctx.openInvite({ search: '?view=1&sample=1&t=wedding' }),
  { ...fresh('wedding'), photo: null, guest: true, sample: true, broken: false, event: null, publishedEvent: null },
);
check(
  'sample guest mode falls back to the default template for an unknown ?t=',
  ctx.openInvite({ search: '?view=1&sample=1&t=unknown-template' }),
  { ...fresh('birthday'), photo: null, guest: true, sample: true, broken: false, event: null, publishedEvent: null },
);
check(
  'a valid #d= share link wins over sample=1',
  ctx.openInvite({ search: '?view=1&sample=1', hash: hashOf(zoeLink) }),
  {
    ...zoe,
    d: { ...zoe.d, photoY: 50 },
    photo: null,
    guest: true,
    sample: false,
    broken: false,
    event: null,
    publishedEvent: null,
  },
);
check(
  'a malformed #d= share link with sample=1 and e= opens as broken',
  ctx.openInvite({ search: `?view=1&sample=1&e=${EVENT_ID}`, hash: cut }),
  { ...fresh('birthday'), photo: null, guest: true, sample: false, broken: true, event: null, publishedEvent: null },
);
check(
  'sample=1 is ignored outside guest view',
  ctx.openInvite({ search: '?sample=1', draft, photo: 'data:image/jpeg;base64,x', publishedEvent: stored }),
  {
    t: 'birthday',
    d: ctx.makeInviteData(ctx.getTemplate('birthday'), { title: 'Zoe turns 30' }),
    photo: 'data:image/jpeg;base64,x',
    guest: false,
    sample: false,
    broken: false,
    event: null,
    publishedEvent: identity,
  },
);
check(
  'a legacy ?view=1&e=<id> invitation link still opens its event as a guest',
  ctx.openInvite({
    search: `?view=1&e=${EVENT_ID}`,
    draft,
    photo: 'data:image/jpeg;base64,x',
    publishedEvent: stored,
  }),
  {
    ...fresh('birthday'),
    photo: null,
    guest: true,
    sample: false,
    broken: false,
    event: EVENT_ID,
    publishedEvent: null,
  },
);
for (const path of ['/e/', '/e/short', `/e/${EVENT_ID}A`, `/e/${EVENT_ID.slice(1)}+`, `/e/${EVENT_ID}/extra`]) {
  check(
    `an /e/ path "${path}" opens as broken without stored owner state`,
    [ctx.openInvite({ pathname: path, draft, photo: 'data:image/jpeg;base64,x', publishedEvent: stored })].map((s) => [
      s.guest,
      s.broken,
      s.event,
      s.photo,
      s.publishedEvent,
    ])[0],
    [true, true, null, null, null],
  );
}
for (const id of ['', 'short', `${EVENT_ID}A`, `${EVENT_ID.slice(1)}+`]) {
  check(
    `a legacy invitation link with event id "${id}" opens as broken`,
    [ctx.openInvite({ search: `?view=1&e=${encodeURIComponent(id)}` })].map((s) => [s.broken, s.event])[0],
    [true, null],
  );
}
check(
  'eventPreviewMeta builds title and description from title, date, time and venue',
  ctx.eventPreviewMeta(
    ctx.makeInviteData(birthday, {
      title: 'Zoe turns 30',
      date: '2026-12-12',
      time: '14:00',
      venue: 'Willow Park Pavilion',
    }),
  ),
  {
    title: 'Zoe turns 30',
    pageTitle: 'Zoe turns 30 | Petalpost',
    description: 'Saturday, December 12, 2026 at 2:00 PM · Willow Park Pavilion',
  },
);
check(
  'eventPreviewMeta falls back to address when venue is empty, and to generic copy when empty',
  [
    ctx.eventPreviewMeta(
      ctx.makeInviteData(birthday, {
        title: 'Zoe turns 30',
        date: '2026-12-12',
        time: '',
        venue: '',
        address: '24 Willow Lane',
      }),
    ),
    ctx.eventPreviewMeta(ctx.makeInviteData(birthday, { title: '', date: '', time: '', venue: '', address: '' })),
  ],
  [
    {
      title: 'Zoe turns 30',
      pageTitle: 'Zoe turns 30 | Petalpost',
      description: 'Saturday, December 12, 2026 · 24 Willow Lane',
    },
    {
      title: 'You are invited',
      pageTitle: 'You are invited | Petalpost',
      description: 'You are invited. Open the invitation to see the details and reply.',
    },
  ],
);
check(
  'the owner reopens the stored event identity',
  ctx.openInvite({ draft, publishedEvent: stored }).publishedEvent,
  identity,
);
check(
  'a stored event identity that never got a version reopens',
  ctx.openInvite({ publishedEvent: JSON.stringify({ ...identity, version: null }) }).publishedEvent,
  { ...identity, version: null },
);
for (const [label, value] of Object.entries({
  'unreadable JSON': '{',
  'a short secret': JSON.stringify({ ...identity, secret: 'abc' }),
  'a malformed id': JSON.stringify({ ...identity, id: 'x' }),
  'a version of 0': JSON.stringify({ ...identity, version: 0 }),
  'a version given as text': JSON.stringify({ ...identity, version: '3' }),
  'no version': JSON.stringify({ id: identity.id, secret: identity.secret }),
})) {
  check(
    `a stored event identity with ${label} is dropped`,
    ctx.openInvite({ publishedEvent: value }).publishedEvent,
    null,
  );
}
const eventStore = memory();
const publisher = { ...ctx.openInvite({}), publishedEvent: identity };
ctx.savePublishedEvent(publisher, eventStore);
check(
  'a saved event identity survives a reload, next to the draft',
  ctx.openInvite(ctx.storedInvite(eventStore)).publishedEvent,
  identity,
);
ctx.savePublishedEvent({ ...publisher, publishedEvent: null }, eventStore);
check('forgetting the event identity removes it', ctx.storedInvite(eventStore).publishedEvent, null);
const guestEventStore = memory();
ctx.savePublishedEvent({ ...publisher, guest: true }, guestEventStore);
check('the guest view never writes an event identity', guestEventStore.items.size, 0);

// Decoding can finish out of order after another upload or removal.
const pendingPhoto = () => {
  let finish;
  const decoded = new Promise((resolve) => {
    finish = resolve;
  });
  return { decoded, finish };
};
const overlapping = ctx.openInvite({});
const overlappingStore = memory();
const firstPhoto = pendingPhoto();
const firstChange = ctx.changePhoto(overlapping, firstPhoto.decoded, overlappingStore);
await ctx.changePhoto(overlapping, Promise.resolve('data:image/jpeg;base64,TkVX'), overlappingStore);
firstPhoto.finish('data:image/jpeg;base64,T0xE');
await firstChange;
check(
  'the latest uploaded photo stays in the preview and survives a reload',
  [
    ctx
      .renderInvite(birthday, { ...overlapping.d, photo: overlapping.photo })
      .includes("url('data:image/jpeg;base64,TkVX')"),
    ctx.openInvite(ctx.storedInvite(overlappingStore)).photo,
  ],
  [true, 'data:image/jpeg;base64,TkVX'],
);
const removedPhoto = pendingPhoto();
const removedChange = ctx.changePhoto(overlapping, removedPhoto.decoded, overlappingStore);
await ctx.changePhoto(overlapping, null, overlappingStore);
removedPhoto.finish('data:image/jpeg;base64,T0xE');
await removedChange;
check(
  'removing a photo during decoding keeps template art and no stored photo',
  [
    ctx.renderInvite(birthday, { ...overlapping.d, photo: overlapping.photo }).includes(birthday.art),
    ctx.openInvite(ctx.storedInvite(overlappingStore)).photo,
  ],
  [true, null],
);

// Guest map link: the address as a Google Maps search, or null without an address.
check(
  'an address becomes an encoded map search',
  ctx.mapLink({ address: '1 Main St, Café & Co' }),
  'https://www.google.com/maps/search/?api=1&query=1%20Main%20St%2C%20Caf%C3%A9%20%26%20Co',
);
check('an empty address has no map link', [ctx.mapLink({ address: '' }), ctx.mapLink({})], [null, null]);

// Rendered invites carry their sizing container, which may be a link.
const sample = ctx.makeInviteData(birthday);
check(
  'an invite renders inside its sizing container',
  /^<div class="invite-wrap">\s*<article class="invite /.test(ctx.renderInvite(birthday, sample)),
  true,
);
check(
  'the sizing container can be a labelled link with escaped attributes',
  /^<a class="invite-wrap" href="editor.html\?t=a&amp;b" aria-label="Use the &quot;Bash&quot; template">/.test(
    ctx.renderInvite(birthday, sample, { href: 'editor.html?t=a&b', label: 'Use the "Bash" template' }),
  ),
  true,
);
check(
  'the sizing container can be a span inside a label',
  /^<span class="invite-wrap">/.test(ctx.renderInvite(birthday, sample, { inline: true })),
  true,
);
check(
  'a decorative invite is hidden from screen readers',
  /^<div class="invite-wrap" aria-hidden="true">/.test(ctx.renderInvite(birthday, sample, { decorative: true })),
  true,
);
check(
  'a JPEG photo renders as the card art',
  ctx
    .renderInvite(birthday, { ...sample, photo: 'data:image/jpeg;base64,QUJD' })
    .includes("url('data:image/jpeg;base64,QUJD')"),
  true,
);
for (const bad of ["data:image/jpeg;base64,x');background:url('https://evil.test/", 'https://evil.test/a.jpg']) {
  const html = ctx.renderInvite(birthday, { ...sample, photo: bad });
  check(
    `a photo "${bad.slice(0, 24)}" that is not a JPEG or PNG data URL renders the template art`,
    [html.includes('evil.test'), html.includes(birthday.art)],
    [false, true],
  );
}
check(
  'the hero templates exist',
  ctx.HERO_TEMPLATES.map((id) => ctx.getTemplate(id).id),
  ctx.HERO_TEMPLATES,
);
check('there are three hero templates, one per .fan > :nth-child rule in css/styles.css', ctx.HERO_TEMPLATES.length, 3);
check('the banner template exists', ctx.getTemplate(ctx.BANNER_TEMPLATE).id, ctx.BANNER_TEMPLATE);
const ids = ctx.TEMPLATES.map((t) => t.id);
check('the default template exists', ids.includes(ctx.DEFAULT_TEMPLATE), true);
check(
  'an unknown template id opens the default template',
  ctx.getTemplate('no-such-template').id,
  ctx.DEFAULT_TEMPLATE,
);
check(
  'the popular templates exist',
  (ctx.POPULAR_TEMPLATES || [null]).filter((id) => !ids.includes(id)),
  [],
);
check(
  'template ids are unique',
  ids.filter((id, i, ids) => ids.indexOf(id) !== i),
  [],
);

// Calendar file: events last three hours and may end the next day.
const now = new Date('2026-10-30T09:15:00Z');
const lines = (data) => ctx.buildIcs(data, now).split('\r\n');
const afternoon = lines({ title: 'Mia turns seven', date: '2026-12-12', time: '14:00' });
check(
  'a 14:00 event starts at 14:00',
  afternoon.find((l) => l.startsWith('DTSTART')),
  'DTSTART:20261212T140000',
);
check(
  'a 14:00 event ends at 17:00',
  afternoon.find((l) => l.startsWith('DTEND')),
  'DTEND:20261212T170000',
);
check(
  'the stamp is the given time',
  afternoon.find((l) => l.startsWith('DTSTAMP')),
  'DTSTAMP:20261030T091500Z',
);
const late = lines({ title: 'New year', date: '2026-12-31', time: '23:30' });
check(
  'a 23:30 event ends at 02:30 the next day',
  late.find((l) => l.startsWith('DTEND')),
  'DTEND:20270101T023000',
);
check(
  'an event without a time starts at noon',
  lines({ date: '2026-12-12' }).find((l) => l.startsWith('DTSTART')),
  'DTSTART:20261212T120000',
);
check(
  'summary text is escaped',
  lines({ title: 'Tea; cake, games', date: '2026-12-12' }).find((l) => l.startsWith('SUMMARY')),
  'SUMMARY:Tea\\; cake\\, games',
);
check(
  'a lone carriage return in the title cannot end a calendar line',
  ctx.buildIcs({ title: 'Tea\rATTENDEE:evil', date: '2026-12-12' }, now).replaceAll('\r\n', '').includes('\r'),
  false,
);
check(
  'a carriage return and line feed in the venue become one escaped break',
  lines({ title: 'Tea', venue: 'Hall\r\nDoor', date: '2026-12-12' }).find((l) => l.startsWith('LOCATION')),
  'LOCATION:Hall\\nDoor',
);
check('an event without a date has no calendar file', ctx.buildIcs({ title: 'Tea' }, now), null);
check(
  'every template sample has a calendar file',
  ctx.TEMPLATES.filter((t) => !ctx.buildIcs(ctx.makeInviteData(t), now)).map((t) => t.id),
  [],
);

// RFC 5545 section 3.1: lines stay within 75 octets; a longer one continues after a line break and one space.
const longestIcs = ctx.buildIcs(
  ctx.makeInviteData(birthday, {
    title: 'é'.repeat(48),
    hosts: 'Hosts, '.repeat(9),
    address: '🎂'.repeat(45),
    message: 'Café; '.repeat(19),
    rsvp: 'r'.repeat(40),
  }),
  now,
);
check(
  'no calendar line is longer than 75 octets',
  longestIcs
    .split('\r\n')
    .map((l) => new TextEncoder().encode(l).length)
    .filter((n) => n > 75),
  [],
);
check(
  'unfolding a calendar line restores its text',
  longestIcs
    .replace(/\r\n /g, '')
    .split('\r\n')
    .find((l) => l.startsWith('LOCATION')),
  `LOCATION:Willow Park Pavilion\\, ${'🎂'.repeat(45)}`,
);

test('the report link mails the contact address with the invitation link and the elements of a DSA notice', () => {
  const link = ctx.reportLink('https://www.petalpost.ro/e/AAAAAAAAAAAAAAAAAAAAAA');
  const url = new URL(link);
  const body = url.searchParams.get('body');
  assert.deepEqual(
    {
      scheme: url.protocol,
      to: url.pathname,
      subject: url.searchParams.get('subject'),
      link: body.includes('https://www.petalpost.ro/e/AAAAAAAAAAAAAAAAAAAAAA'),
      elements: ['Why this content is illegal', 'Your name:', 'Your email address:', 'good faith'].map((word) =>
        body.includes(word),
      ),
    },
    {
      scheme: 'mailto:',
      to: ctx.CONTACT,
      subject: 'Report of an invitation',
      link: true,
      elements: [true, true, true, true],
    },
  );
});

// Romanian localization: copy coverage, sample limits, 24-hour time formatting, locale-scoped storage, diacritic slugs and Romanian DSA notice.
check(
  'every bilingual template has Romanian localization copy',
  ctx.TEMPLATES.filter((t) => (!t.locales || (t.locales.includes('en') && t.locales.includes('ro'))) && !t.ro).map(
    (t) => t.id,
  ),
  [],
);
const roCategories = ctx.categoriesFor('ro');
check(
  'the Romanian occasions put Moț right after Botez and the English catalog leaves Moț out',
  [
    roCategories.indexOf('Moț') - roCategories.indexOf('Botez'),
    ctx
      .templatesFor('ro')
      .filter((t) => t.category === 'Moț')
      .map((t) => t.id),
    ctx.categoriesFor('en').includes('Moț'),
    ctx.templatesFor('en').filter((t) => t.category === 'Moț').length,
  ],
  [1, ['mot-foarfeca', 'mot-tava', 'mot-turta', 'mot-primul-an'], false, 0],
);
check(
  'every Romanian template sample fits its limits',
  ctx.templatesFor('ro').flatMap((t) =>
    Object.entries(ctx.FIELD_LIMITS)
      .filter(([f, max]) => max && (t.defaults[f] || '').length > max)
      .map(([f]) => `${t.id}.${f}`),
  ),
  [],
);
check(
  'Romanian hero and popular templates exist and there are three hero templates',
  [
    ctx.RO_HERO_TEMPLATES.length,
    ctx.RO_HERO_TEMPLATES.map((id) => ctx.getTemplate(id, 'ro').id),
    ctx.RO_POPULAR_TEMPLATES.filter((id) => !ids.includes(id)),
  ],
  [3, ctx.RO_HERO_TEMPLATES, []],
);
check(
  'renderInvite formats Romanian dates and 24-hour times with ora',
  (() => {
    const html = ctx.renderInvite(
      ctx.getTemplate('botez-porumbel', 'ro'),
      ctx.makeInviteData(ctx.getTemplate('botez-porumbel', 'ro'), { date: '2027-05-15', time: '14:30' }, 'ro'),
      { locale: 'ro-RO' },
    );
    return [html.includes('ora 14:30'), /\b(AM|PM)\b/.test(html)];
  })(),
  [true, false],
);
check(
  'slug strips Romanian diacritics cleanly',
  ctx.slug('Botezul lui Matei — Nuntă și Cununie'),
  'botezul-lui-matei-nunta-si-cununie',
);
check(
  'editorUrl targets /ro/editor.html for Romanian',
  ctx.editorUrl('botez-porumbel', 'ro'),
  '/ro/editor.html?t=botez-porumbel',
);
test('Romanian drafts stay isolated from English drafts in storage', () => {
  const map = new Map();
  const store = {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
  const en = ctx.openInvite({ search: '?t=birthday', lang: 'en' });
  const ro = ctx.openInvite({ search: '?t=botez-porumbel', lang: 'ro' });
  ctx.saveDraft(en, store, 'en');
  ctx.saveDraft(ro, store, 'ro');
  assert.equal(ctx.openInvite({ ...ctx.storedInvite(store, 'en'), lang: 'en' }).d.title, 'Mia turns seven');
  assert.equal(ctx.openInvite({ ...ctx.storedInvite(store, 'ro'), lang: 'ro' }).d.title, 'Botezul lui Matei');
});
test('Romanian report link uses Romanian subject and DSA elements', () => {
  const link = ctx.reportLink('https://www.petalpost.ro/ro/e/AAAAAAAAAAAAAAAAAAAAAA', 'ro');
  const url = new URL(link);
  const body = url.searchParams.get('body');
  assert.deepEqual(
    {
      subject: url.searchParams.get('subject'),
      elements: ['De ce acest conținut este ilegal', 'Numele tău:', 'Adresa ta de email:', 'bună-credință'].map(
        (word) => body.includes(word),
      ),
    },
    { subject: 'Raportare invitație', elements: [true, true, true, true] },
  );
});
check(
  'a /ro/e/<id> invitation link opens its event as a Romanian guest, and eventPreviewMeta formats 24-hour time',
  [
    ctx.openInvite({ pathname: ctx.eventLink('', EVENT_ID, 'ro'), lang: 'ro' }).event,
    ctx
      .eventPreviewMeta(
        ctx.makeInviteData(
          ctx.getTemplate('botez-porumbel', 'ro'),
          { title: 'Botezul lui Matei', date: '2027-05-15', time: '14:30', venue: 'Biserica Sf. Elefterie' },
          'ro',
        ),
        'ro-RO',
      )
      .description.includes('ora 14:30 · Biserica Sf. Elefterie'),
  ],
  [EVENT_ID, true],
);

// The banner shows on an English page with a Romanian alternate, to a browser that prefers Romanian, until it is closed.
test('the Romanian language banner links the Romanian alternate only for Romanian browsers on open English pages', () => {
  const page = {
    lang: 'en',
    languages: ['en-US', 'ro-RO'],
    alternate: 'https://www.petalpost.ro/ro/invitatii-nunta.html',
    closed: false,
  };
  assert.equal(romanianBannerHref(page), '/ro/invitatii-nunta.html');
  assert.equal(romanianBannerHref({ ...page, languages: ['ro'] }), '/ro/invitatii-nunta.html');
  assert.equal(romanianBannerHref({ ...page, alternate: 'https://www.petalpost.ro/ro/' }), '/ro/');
  assert.equal(romanianBannerHref({ ...page, languages: ['en-US'] }), null);
  assert.equal(romanianBannerHref({ ...page, languages: [] }), null);
  assert.equal(romanianBannerHref({ ...page, lang: 'ro' }), null);
  assert.equal(romanianBannerHref({ ...page, alternate: null }), null);
  assert.equal(romanianBannerHref({ ...page, closed: true }), null);
});
