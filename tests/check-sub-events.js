// Fails when sub-events break. Checks: sub-events in a record, their repair, their cap of MAX_SUB_EVENTS and the
// record without sub-events, which keeps its earlier shape; the editor actions that add, change, reorder and remove
// a sub-event, and refuse an index, a field or a move outside the list and an add past the cap; publishing and
// opening an invitation with sub-events in English and Romanian; the refusal of a malformed sub-event list; an
// invitation without sub-events and its replies, which behave as before, also after a republish with sub-events; the
// retention job, which counts from the last sub-event's date, or from the invitation's date when no sub-event has
// one; the calendar file with one entry for each sub-event with a date; the guest view's schedule in English and
// Romanian, with its escaping.
// Each API test uses fresh random ids and client IPs in the shared migrated in-memory PGlite database of
// tests/api-setup.js, except the retention check, which runs in a database of its own.
// Run: pnpm exec node tests/check-sub-events.js
import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import {
  MAX_SUB_EVENTS,
  addSubEvent,
  buildIcs,
  makeInviteData,
  moveSubEvent,
  removeSubEvent,
  updateSubEvent,
} from '../public/js/invite.js';
import { newId } from '../public/js/rsvp.js';
import { getTemplate, renderSchedule } from '../public/js/templates.js';
import { guest, host, openDatabase, setup } from './api-setup.js';

const civil = { name: 'Civil ceremony', date: '2027-06-12', time: '11:00', venue: 'City Hall' };
const church = { name: 'Church', date: '2027-06-12', time: '14:00', venue: 'St. Mary' };
const dinner = { name: 'Dinner', date: '2027-06-13', time: '19:30', venue: 'Lake House' };
const wedding = (subEvents, lang = 'en') => ({
  t: 'wedding',
  d: makeInviteData(getTemplate('wedding', lang), { title: 'Ana & Mihai', subEvents }, lang),
});
const sam = { name: 'Sam', attending: true, partySize: 2, note: '' };

test('a record without sub-events has no subEvents key, as before sub-events existed', () => {
  assert.equal('subEvents' in makeInviteData(getTemplate('wedding')), false);
  assert.equal('subEvents' in makeInviteData(getTemplate('wedding'), { subEvents: [] }), false);
  assert.equal('subEvents' in makeInviteData(getTemplate('wedding'), { subEvents: 'Church' }), false);
});

test('a record keeps its sub-events in order, cuts long text and empties invalid fields', () => {
  const d = makeInviteData(getTemplate('wedding'), {
    subEvents: [civil, { name: 'x'.repeat(50), date: '2027-02-30', time: '25:00', venue: 7, extra: 'x' }, null],
  });
  assert.deepEqual(d.subEvents, [
    civil,
    { name: 'x'.repeat(40), date: '', time: '', venue: '' },
    { name: '', date: '', time: '', venue: '' },
  ]);
});

test(`a record keeps at most ${MAX_SUB_EVENTS} sub-events`, () => {
  const d = makeInviteData(getTemplate('wedding'), { subEvents: Array(MAX_SUB_EVENTS + 2).fill(civil) });
  assert.equal(d.subEvents.length, MAX_SUB_EVENTS);
});

test('the editor adds, changes, reorders and removes sub-events', () => {
  const state = wedding(undefined);
  assert.equal(addSubEvent(state), true);
  assert.equal(addSubEvent(state), true);
  assert.equal(updateSubEvent(state, 0, 'name', 'Church'), true);
  assert.equal(updateSubEvent(state, 1, 'name', 'Dinner'), true);
  assert.equal(updateSubEvent(state, 1, 'date', '2027-06-13'), true);
  assert.equal(moveSubEvent(state, 1, -1), true);
  assert.deepEqual(
    state.d.subEvents.map((s) => [s.name, s.date]),
    [
      ['Dinner', '2027-06-13'],
      ['Church', ''],
    ],
  );
  assert.equal(moveSubEvent(state, 0, 1), true);
  assert.deepEqual(
    state.d.subEvents.map((s) => s.name),
    ['Church', 'Dinner'],
  );
  assert.equal(removeSubEvent(state, 0), true);
  assert.deepEqual(state.d.subEvents, [{ name: 'Dinner', date: '2027-06-13', time: '', venue: '' }]);
  assert.equal(removeSubEvent(state, 0), true);
  assert.equal('subEvents' in state.d, false);
  assert.equal(state.d.title, 'Ana & Mihai');
});

test('the editor refuses an index, a field or a move outside the list, and an add past the cap', () => {
  const state = wedding([civil, church]);
  const before = JSON.stringify(state.d);
  assert.deepEqual(
    [
      updateSubEvent(state, 2, 'name', 'x'),
      updateSubEvent(state, 0, 'photo', 'x'),
      moveSubEvent(state, 0, -1),
      moveSubEvent(state, 1, 1),
      removeSubEvent(state, 5),
    ],
    [false, false, false, false, false],
  );
  assert.equal(JSON.stringify(state.d), before);
  const full = wedding(Array(MAX_SUB_EVENTS).fill(civil));
  assert.equal(addSubEvent(full), false);
  assert.equal(full.d.subEvents.length, MAX_SUB_EVENTS);
});

for (const lang of ['en', 'ro']) {
  test(`an invitation with sub-events in ${lang} opens with them in another browser`, async () => {
    const { client } = await setup();
    const cred = host();
    const record = wedding([civil, church, dinner], lang);
    const { photoY, ...published } = record.d;
    assert.equal((await client(newId(), lang).publish(cred, record)).status, 201);
    const opened = await client(newId(), lang).loadEvent(cred.id);
    assert.deepEqual(
      { status: opened.status, data: opened.data },
      { status: 200, data: { t: 'wedding', d: published } },
    );
  });
}

test('a malformed sub-event list is refused with 400 and stores nothing', async () => {
  const { raw } = await setup();
  const { photoY, ...d } = wedding(undefined).d;
  const bodies = {
    'not a list': { ...d, subEvents: 'Church' },
    'too many': { ...d, subEvents: Array(MAX_SUB_EVENTS + 1).fill(civil) },
    'a long name': { ...d, subEvents: [{ ...civil, name: 'x'.repeat(41) }] },
    'a long venue': { ...d, subEvents: [{ ...civil, venue: 'x'.repeat(61) }] },
    'an impossible date': { ...d, subEvents: [{ ...civil, date: '2027-02-30' }] },
    'an unreadable time': { ...d, subEvents: [{ ...civil, time: '7pm' }] },
    'a missing field': { ...d, subEvents: [{ name: 'Church', date: '', time: '' }] },
    'an extra field': { ...d, subEvents: [{ ...civil, address: 'Main St' }] },
    'a number field': { ...d, subEvents: [{ ...civil, venue: 7 }] },
    'a null entry': { ...d, subEvents: [null] },
  };
  const results = {};
  for (const [label, body] of Object.entries(bodies)) {
    const cred = host();
    const put = await raw(`/api/events/${cred.id}`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${cred.secret}`, 'content-type': 'application/json', 'x-real-ip': newId() },
      body: JSON.stringify({ t: 'wedding', d: body }),
    });
    results[label] = [put.status, (await raw(`/api/events/${cred.id}`)).status];
  }
  assert.deepEqual(results, Object.fromEntries(Object.keys(bodies).map((label) => [label, [400, 404]])));
});

test('an invitation without sub-events and its replies behave as before, also after sub-events are added', async () => {
  const { client, raw } = await setup();
  const browser = client();
  const guests = client(newId());
  const cred = host();
  // A page loaded before sub-events existed sends no subEvents key; this page sends none for an empty list either,
  // and an empty list from a hand-made request stores no key.
  await browser.publish(cred, wedding(undefined));
  assert.equal('subEvents' in (await guests.loadEvent(cred.id)).data.d, false);
  const empty = host();
  const { photoY, ...d } = wedding(undefined).d;
  await raw(`/api/events/${empty.id}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${empty.secret}`, 'content-type': 'application/json', 'x-real-ip': newId() },
    body: JSON.stringify({ t: 'wedding', d: { ...d, subEvents: [] } }),
  });
  assert.deepEqual((await guests.loadEvent(empty.id)).data, { t: 'wedding', d });
  const reply = guest();
  assert.equal((await guests.saveReply(cred.id, reply, sam)).status, 201);
  cred.version = 1;
  const changed = await browser.publish(cred, wedding([civil]));
  assert.equal(changed.status, 200);
  assert.deepEqual((await guests.loadEvent(cred.id)).data.d.subEvents, [civil]);
  const loaded = await guests.loadReply(cred.id, { ...reply, version: 1 });
  assert.deepEqual(
    { name: loaded.data.name, attending: loaded.data.attending, partySize: loaded.data.partySize },
    { name: 'Sam', attending: true, partySize: 2 },
  );
  const managed = await browser.loadResponses(cred);
  assert.deepEqual(
    { names: managed.data.responses.map((r) => r.name), totals: managed.data.totals },
    { names: ['Sam'], totals: { responses: 1, yes: 1, no: 0, attending: 2 } },
  );
});

// dayOffset(n) is the UTC date n days from today.
const dayOffset = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

test('the retention job counts 90 days from the last sub-event date, or from the invitation date without one', async () => {
  const db = await openDatabase();
  after(() => db.close());
  const { client, raw } = await setup(db);
  const browser = client();
  const at = (date) => ({ ...civil, date });
  const cases = {
    'last sub-event 91 days ago': {
      date: dayOffset(-10),
      subEvents: [at(dayOffset(-92)), at(dayOffset(-91))],
      deleted: true,
    },
    'last sub-event 90 days ago': {
      date: dayOffset(-200),
      subEvents: [at(dayOffset(-90)), at(dayOffset(-300))],
      deleted: false,
    },
    'sub-events without dates, event 91 days ago': { date: dayOffset(-91), subEvents: [at('')], deleted: true },
    'sub-events without dates, event 90 days ago': { date: dayOffset(-90), subEvents: [at('')], deleted: false },
  };
  const creds = {};
  for (const [label, { date, subEvents }] of Object.entries(cases)) {
    creds[label] = host();
    await browser.publish(creds[label], {
      t: 'wedding',
      d: makeInviteData(getTemplate('wedding'), { date, subEvents }),
    });
    await db.query("update events set updated_at = now() - interval '200 days' where id = $1", [creds[label].id]);
  }
  await raw('/api/retention');
  const gone = {};
  for (const label of Object.keys(cases)) gone[label] = (await browser.loadEvent(creds[label].id)).status === 404;
  assert.deepEqual(gone, Object.fromEntries(Object.entries(cases).map(([label, { deleted }]) => [label, deleted])));
});

const now = new Date('2026-10-30T09:15:00Z');
const entries = (ics) =>
  ics
    .replace(/\r\n /g, '')
    .split('BEGIN:VEVENT')
    .slice(1)
    .map((e) =>
      Object.fromEntries(
        e
          .split('\r\n')
          .filter((l) => /^(UID|DTSTART|SUMMARY|LOCATION):/.test(l))
          .map((l) => l.split(/:(.*)/s).slice(0, 2)),
      ),
    );

for (const lang of ['en', 'ro']) {
  test(`the calendar file in ${lang} has one entry for each sub-event with a date`, () => {
    const d = makeInviteData(
      getTemplate('wedding', lang),
      {
        title: 'Ana & Mihai',
        venue: 'Lake House',
        address: 'Main St 1',
        subEvents: [civil, { ...church, date: '' }, { ...dinner, venue: '' }],
      },
      lang,
    );
    assert.deepEqual(entries(buildIcs(d, now)), [
      {
        UID: '20270612-ana-mihai-1@petalpost',
        DTSTART: '20270612T110000',
        SUMMARY: 'Ana & Mihai: Civil ceremony',
        LOCATION: 'City Hall',
      },
      {
        UID: '20270613-ana-mihai-3@petalpost',
        DTSTART: '20270613T193000',
        SUMMARY: 'Ana & Mihai: Dinner',
        LOCATION: 'Lake House\\, Main St 1',
      },
    ]);
  });
}

test('the calendar file has the invitation entry when no sub-event has a date, and none without any date', () => {
  const undated = makeInviteData(getTemplate('wedding'), {
    title: 'Tea',
    date: '2027-01-02',
    subEvents: [{ name: 'Tea' }],
  });
  assert.deepEqual(
    entries(buildIcs(undated, now)).map((e) => e.UID),
    ['20270102-tea@petalpost'],
  );
  assert.equal(buildIcs({ ...undated, date: '' }, now), null);
});

test('the schedule lists each sub-event with its date, time and venue, escaped, in English and Romanian', () => {
  const d = makeInviteData(getTemplate('wedding'), {
    subEvents: [
      { ...civil, name: '<b>Civil</b>' },
      { name: '', date: '', time: '', venue: 'Garden' },
    ],
  });
  const text = (html) =>
    html
      .replace(/<[^>]+>/g, '|')
      .replace(/\s+/g, ' ')
      .split('|')
      .map((t) => t.trim())
      .filter(Boolean);
  assert.deepEqual(text(renderSchedule(d, 'en-US')), [
    '&lt;b&gt;Civil&lt;/b&gt;',
    'Saturday, June 12, 2027 at 11:00 AM',
    'City Hall',
    'Garden',
  ]);
  assert.deepEqual(text(renderSchedule(d, 'ro-RO')).slice(1, 2), ['sâmbătă, 12 iunie 2027, ora 11:00']);
  assert.equal(renderSchedule(makeInviteData(getTemplate('wedding')), 'en-US'), '');
});
