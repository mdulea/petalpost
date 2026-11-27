// Fails when guest-list retention breaks in the RSVP API or dynamic /e/{id} route. Checks: a guest-list invitation
// is deleted after 23:59 Europe/Bucharest time on the day after the event and not before, across both the spring
// and autumn daylight saving changes and even when updated on the day after the event; with sub-events, the day
// after the latest sub-event date counts, also for a party invited only to an earlier sub-event; the deletion removes
// its parties and their replies; afterwards the public invitation API, the tracker API, the personal link API, the view
// link API and the /e/{id} and /ro/e/{id} pages return 410 with "This invitation has ended" (and its Romanian wording)
// without event details; a retried publish cannot restore an ended link; open invitations keep the 90-day rule,
// including one without a date.
// Each test uses its own migrated in-memory PGlite database.
// Run: pnpm exec node tests/check-retention.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeInviteData } from '../public/js/invite.js';
import { newId, partyLinkSecret, viewLinkSecret } from '../public/js/rsvp.js';
import { getTemplate } from '../public/js/templates.js';
import { createEventPage } from '../server/event-page.js';
import { guest, host, openDatabase, setup } from './api-setup.js';

const ENDED = {
  en: { error: 'This invitation has ended.', title: 'This invitation has ended | Petalpost' },
  ro: { error: 'Această invitație s-a încheiat.', title: 'Această invitație s-a încheiat | Petalpost' },
};

const invite = (overrides) => ({
  t: 'birthday',
  d: makeInviteData(getTemplate('birthday'), { title: 'Zoë turns 7', ...overrides }),
});

// Creates an API on a fresh database whose clock reads from clock.now.
async function withClock(t, iso) {
  const db = await openDatabase();
  t.after(() => db.close());
  const clock = { now: new Date(iso) };
  const api = await setup(db, { now: () => clock.now });
  return { ...api, clock };
}

for (const { label, date, before, at } of [
  {
    label: 'before the spring daylight saving change (EET, UTC+2)',
    date: '2026-03-27',
    before: '2026-03-28T21:58:59Z',
    at: '2026-03-28T21:59:00Z',
  },
  {
    label: 'across the spring daylight saving change (EEST, UTC+3)',
    date: '2026-03-28',
    before: '2026-03-29T20:58:59Z',
    at: '2026-03-29T20:59:00Z',
  },
  {
    label: 'across the autumn daylight saving change (EET, UTC+2)',
    date: '2026-10-24',
    before: '2026-10-25T21:58:59Z',
    at: '2026-10-25T21:59:00Z',
  },
]) {
  test(`the retention job deletes a guest-list invitation at 23:59 Europe/Bucharest on the day after the event ${label}`, async (t) => {
    const { db, client, raw, clock } = await withClock(t, before);
    const cred = host();
    const browser = client();
    await browser.publish(cred, invite({ mode: 'guestList', date }));
    // Updating on the day after the event does not extend a guest-list invitation.
    await db.query('update events set updated_at = $2 where id = $1', [cred.id, before]);
    const partyId = newId();
    await browser.addParty(cred, partyId, { name: 'Familia Radu', defaultSeats: 3 });
    const personal = { id: partyId, secret: await partyLinkSecret(cred.secret, partyId, 'personal') };
    await browser.savePartyReply(cred.id, personal, { attending: true, partySize: 2, note: 'No nuts' });

    const tooEarly = await raw('/api/retention');
    assert.deepEqual(
      { status: tooEarly.status, body: await tooEarly.json(), live: (await browser.loadEvent(cred.id)).status },
      { status: 200, body: { deleted: 0 }, live: 200 },
    );

    clock.now = new Date(at);
    const onTime = await raw('/api/retention');
    const counts = (
      await db.query(
        `select (select count(*)::int from events where id = $1) as events,
                (select count(*)::int from parties where event_id = $1) as parties,
                (select count(*)::int from responses where event_id = $1) as replies`,
        [cred.id],
      )
    ).rows[0];
    assert.deepEqual(
      { status: onTime.status, body: await onTime.json(), counts },
      { status: 200, body: { deleted: 1 }, counts: { events: 0, parties: 0, replies: 0 } },
    );
  });
}

test('the retention job counts a guest-list invitation from its latest sub-event date', async (t) => {
  const { client, raw, clock } = await withClock(t, '2026-06-16T20:59:00Z');
  const cred = host();
  const browser = client();
  const subEvents = [
    { id: 'party', name: 'Party', date: '2026-06-18' },
    { id: 'civil', name: 'Civil ceremony', date: '2026-06-15' },
  ];
  await browser.publish(cred, invite({ mode: 'guestList', date: '2026-06-15', subEvents }));
  // A party invited only to the earlier civil ceremony keeps its personal link until the latest sub-event ends.
  const partyId = newId();
  await browser.addParty(cred, partyId, { name: 'Familia Radu', defaultSeats: 2 });
  assert.equal((await browser.setPartySubEvents(cred, [partyId], ['civil'])).status, 204);
  const personal = { id: partyId, secret: await partyLinkSecret(cred.secret, partyId, 'personal') };
  assert.deepEqual(await (await raw('/api/retention')).json(), { deleted: 0 });
  assert.equal((await browser.loadParty(cred.id, personal)).status, 200);
  clock.now = new Date('2026-06-19T20:59:00Z');
  assert.deepEqual(await (await raw('/api/retention')).json(), { deleted: 1 });
});

for (const lang of ['en', 'ro']) {
  test(`in ${lang}, every link and the tracker show "This invitation has ended" without event details after deletion`, async (t) => {
    const { db, client, raw, clock } = await withClock(t, '2026-06-15T12:00:00Z');
    const cred = host();
    const browser = client(newId(), lang);
    const created = await browser.publish(cred, invite({ mode: 'guestList', date: '2026-06-15' }));
    const partyId = newId();
    await browser.addParty(cred, partyId, { name: 'Familia Radu', defaultSeats: 3 });
    const personal = { id: partyId, secret: await partyLinkSecret(cred.secret, partyId, 'personal') };
    const reply = await browser.savePartyReply(cred.id, personal, { attending: true, partySize: 2, note: 'No nuts' });
    personal.version = reply.data.version;

    clock.now = new Date('2026-06-16T20:59:00Z');
    assert.equal((await raw('/api/retention')).status, 200);

    const publicRead = await browser.loadEvent(cred.id);
    const trackerRead = await browser.loadResponses(cred);
    const personalRead = await browser.loadParty(cred.id, personal);
    const viewRead = await browser.loadPartyView(cred.id, {
      id: partyId,
      secret: await viewLinkSecret(personal.secret, partyId),
    });
    const personalPatch = await browser.savePartyReply(cred.id, personal, { attending: false, partySize: 0, note: '' });
    const personalDelete = await browser.withdrawPartyReply(cred.id, personal);
    const hostUpdate = await browser.publish(
      { ...cred, version: created.data.version },
      invite({ mode: 'guestList', date: '2026-06-20' }),
    );
    const publishRetry = await browser.publish(cred, invite({ mode: 'guestList', date: '2026-06-15' }));
    for (const result of [
      publicRead,
      trackerRead,
      personalRead,
      viewRead,
      personalPatch,
      personalDelete,
      hostUpdate,
      publishRetry,
    ]) {
      assert.deepEqual([result.status, result.data], [410, { error: ENDED[lang].error }]);
    }

    const eventPage = createEventPage(db);
    const prefix = lang === 'ro' ? '/ro' : '';
    const page = await eventPage(new Request(`https://petalpost.test${prefix}/e/${cred.id}`));
    const html = await page.text();
    assert.equal(page.status, 410);
    assert.ok(html.includes(`<title>${ENDED[lang].title}</title>`));
    assert.ok(!html.includes('Zoë turns 7'));
    assert.ok(!html.includes('Familia Radu'));
  });
}

test('open invitations keep the 90-day rule, including one without a date', async (t) => {
  const { db, client, raw } = await withClock(t, '2026-07-01T12:00:00Z');
  const browser = client();
  const cases = {
    'guest-list yesterday': { mode: 'guestList', date: '2026-06-29', idle: 0, deleted: true },
    'open same event date': { mode: 'open', date: '2026-06-29', idle: 0, deleted: false },
    'open without date, recent': { mode: 'open', date: '', idle: 90, deleted: false },
    'open without date, 91 days old': { mode: 'open', date: '', idle: 91, deleted: true },
    'open 91 days past event and change': { mode: 'open', date: '2026-04-01', idle: 91, deleted: true },
  };
  const creds = {};
  for (const [label, { mode, date, idle }] of Object.entries(cases)) {
    creds[label] = host();
    await browser.publish(creds[label], invite({ mode, date }));
    await db.query('update events set updated_at = $2::timestamptz - make_interval(days => $3) where id = $1', [
      creds[label].id,
      '2026-07-01T12:00:00Z',
      idle,
    ]);
    if (mode === 'open')
      await browser.saveReply(creds[label].id, guest(), { name: 'Sam', attending: true, partySize: 1 });
  }

  const run = await raw('/api/retention');
  const gone = {};
  for (const label of Object.keys(cases)) gone[label] = !(await browser.loadEvent(creds[label].id)).ok;
  assert.deepEqual(
    { status: run.status, body: await run.json(), gone },
    {
      status: 200,
      body: { deleted: 3 },
      gone: Object.fromEntries(Object.entries(cases).map(([label, { deleted }]) => [label, deleted])),
    },
  );
});
