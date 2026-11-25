// Fails when guest replies, private links, the API client, the RSVP API or the dynamic /e/{id} Open Graph route break. Checks: reply validation and the invalid fields it reports, including the optional note, its trimming, line breaks, control characters and 300-character limit; link fragment
// validation; publishing and opening an invitation from another browser with presentation fields only; updates,
// replays after a lost confirmation, stale versions and simultaneous updates; management and edit secrets that
// reach only their own event or reply; reply totals; reply notes in the management data, the edit link load and their change and clearing, and an update without a note that keeps it; the stored note column's empty default and 300-character check; reply withdrawal, which leaves no stored row or note, its stale version and its repeat; deletion
// with its replies; no secret, hash or reply id in any response, and no-store on all; malformed paths, methods, ids, credentials, bodies, sizes and fields, including a reply without an answer; the daily
// invitation and per-invitation reply quotas; simultaneous new replies at the reply limit and simultaneous edits of
// one reply; the retention job, which deletes an invitation and its replies 91 days after the later of the event
// date and the last change; a daily quota key that is not the IP hash and changes with the day; unavailable storage; network
// failure; private link round trips; dynamic /e/{id} and /ro/e/{id} Open Graph metadata, escaping, HEAD, 404, 405 and 503 responses; the template's
// link preview image at 1200 by 630 with the escaped title in its English or Romanian alt text, and the generic image
// of the page language for a missing invitation, a storage error or an unknown template; Romanian link helpers and localized API error messages via Accept-Language.
// Each test uses fresh random ids and client IPs in one migrated in-memory PGlite database, except the quota key
// checks, which read the stored keys in a database of their own.
// Run: pnpm exec node tests/check-rsvp.js
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { after, test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { getTemplate } from '../public/js/templates.js';
import { eventLink, makeInviteData } from '../public/js/invite.js';
import {
  createClient,
  editorPage,
  makeReply,
  manageLink,
  newId,
  newSecret,
  readCredential,
  responseLink,
} from '../public/js/rsvp.js';
import { createApi } from '../server/api.js';
import { createEventPage } from '../server/event-page.js';
import { migrate } from '../server/migrate.js';

const ID = 'AAAAAAAAAAAAAAAAAAAAAA';
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const SECRET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJ-_01234';

test('a reply keeps the trimmed name, the answer and the party size', () => {
  assert.deepEqual(makeReply({ name: '  Zoë 🎂 ', attending: true, partySize: 3 }), {
    reply: { name: 'Zoë 🎂', attending: true, partySize: 3, note: '' },
    invalid: [],
  });
});

test('a declined reply has a party size of 0', () => {
  assert.deepEqual(makeReply({ name: 'Sam', attending: false, partySize: 0 }), {
    reply: { name: 'Sam', attending: false, partySize: 0, note: '' },
    invalid: [],
  });
});

test('a name of 80 code points is accepted, counting each emoji once', () => {
  assert.equal(makeReply({ name: '🎂'.repeat(80), attending: true, partySize: 1 }).reply?.name, '🎂'.repeat(80));
});

test('a reply note is trimmed and keeps its line breaks', () => {
  const source = {
    name: 'Sam',
    attending: true,
    partySize: 1,
    note: '  No nuts, please.\r\nWe arrive at 3.\rThanks!\n ',
  };
  assert.equal(makeReply(source).reply?.note, 'No nuts, please.\nWe arrive at 3.\nThanks!');
});

test('a reply without a note or with a blank note has an empty note', () => {
  const notes = [undefined, '', ' \n '].map((note) => makeReply({ name: 'Sam', attending: true, partySize: 1, note }));
  assert.deepEqual(
    notes.map(({ reply }) => reply?.note),
    ['', '', ''],
  );
});

test('a note of 300 code points is accepted, counting each emoji once', () => {
  const note = '🎂'.repeat(300);
  assert.equal(makeReply({ name: 'Sam', attending: true, partySize: 1, note }).reply?.note, note);
});

// Each invalid reply with the fields it reports, in form order.
const invalidReplies = {
  'an empty name': { source: { name: '   ', attending: true, partySize: 1 }, invalid: ['name'] },
  'a name of 81 code points': { source: { name: 'a'.repeat(81), attending: true, partySize: 1 }, invalid: ['name'] },
  'a control character in the name': { source: { name: 'Sam\nLee', attending: true, partySize: 1 }, invalid: ['name'] },
  'a name that is not text': { source: { name: 5, attending: true, partySize: 1 }, invalid: ['name'] },
  'an answer that is not a boolean': {
    source: { name: 'Sam', attending: 'yes', partySize: 1 },
    invalid: ['attending'],
  },
  'an attending party of 0': { source: { name: 'Sam', attending: true, partySize: 0 }, invalid: ['partySize'] },
  'an attending party of 11': { source: { name: 'Sam', attending: true, partySize: 11 }, invalid: ['partySize'] },
  'a fractional party size': { source: { name: 'Sam', attending: true, partySize: 1.5 }, invalid: ['partySize'] },
  'a party size given as text': { source: { name: 'Sam', attending: true, partySize: '2' }, invalid: ['partySize'] },
  'a declined reply with guests': { source: { name: 'Sam', attending: false, partySize: 1 }, invalid: ['partySize'] },
  'a note of 301 code points': {
    source: { name: 'Sam', attending: true, partySize: 1, note: 'a'.repeat(301) },
    invalid: ['note'],
  },
  'a tab in the note': { source: { name: 'Sam', attending: true, partySize: 1, note: 'No\tnuts' }, invalid: ['note'] },
  'a note that is not text': { source: { name: 'Sam', attending: true, partySize: 1, note: 5 }, invalid: ['note'] },
  'an empty name and an attending party of 0': {
    source: { name: '', attending: true, partySize: 0 },
    invalid: ['name', 'partySize'],
  },
  'no answer and no party size': {
    source: { name: 'Sam', attending: null, partySize: Number.NaN },
    invalid: ['attending', 'partySize'],
  },
};
for (const [label, { source, invalid }] of Object.entries(invalidReplies)) {
  test(`a reply with ${label} is refused and reports ${invalid.join(' and ')}`, () =>
    assert.deepEqual(makeReply(source), { reply: null, invalid }));
}
test('a missing reply is refused and reports every field', () =>
  assert.deepEqual(makeReply(null), { reply: null, invalid: ['name', 'attending', 'partySize'] }));

test('a management link fragment gives the event id and secret', () => {
  assert.deepEqual(readCredential(`#${ID}.${SECRET}`, ''), { id: ID, secret: SECRET });
});

test('a response edit link fragment gives the response id and secret', () => {
  assert.deepEqual(readCredential(`#r=${ID}.${SECRET}`, 'r='), { id: ID, secret: SECRET });
});

const invalidFragments = {
  'no fragment': ['', ''],
  'the wrong prefix': [`#${ID}.${SECRET}`, 'r='],
  'a short secret': [`#${ID}.${SECRET.slice(1)}`, ''],
  'a long id': [`#${ID}A.${SECRET}`, ''],
  'no separator': [`#${ID}${SECRET}`, ''],
  'a character outside base64url': [`#${ID}.${SECRET.slice(1)}+`, ''],
  'a trailing part': [`#${ID}.${SECRET}.x`, ''],
};
for (const [label, [hash, prefix]] of Object.entries(invalidFragments)) {
  test(`a fragment with ${label} gives no credential`, () => assert.equal(readCredential(hash, prefix), null));
}

// Tests share one migrated in-memory database. Every id is random, and each setup call gets its own client IP,
// so tests stay independent. client(ip) talks to the API the way the browser does;
// raw(path, init) sends a hand-made request for input that the client never produces.
let shared;
after(async () => (await shared)?.close());
async function openDatabase() {
  const db = new PGlite();
  await migrate(db);
  return db;
}
async function setup(db) {
  db ??= await (shared ??= openDatabase());
  const api = createApi(db);
  const ownIp = newId();
  const raw = (path, init = {}) => api(new Request(new URL(path, 'http://petalpost.test'), init));
  const client = (ip = ownIp) =>
    createClient((path, init = {}) => raw(path, { ...init, headers: { ...init.headers, 'x-real-ip': ip } }));
  return { raw, client };
}

const host = () => ({ id: newId(), secret: newSecret(), version: null });
const party = {
  t: 'birthday',
  d: makeInviteData(getTemplate('birthday'), { title: 'Zoë turns 7', message: 'Café, a piñata and 🎂', photoY: 20 }),
};
const { photoY, ...partyFields } = party.d;

test('a published invitation opens from another browser with its presentation fields', async () => {
  const { client } = await setup();
  const cred = host();
  const published = await client().publish(cred, party);
  const opened = await client('198.51.100.2').loadEvent(cred.id);
  assert.deepEqual(
    { published: published.data, opened: opened.data },
    { published: { version: 1, created: true }, opened: { t: 'birthday', d: partyFields } },
  );
});

const edited = { t: 'wedding', d: makeInviteData(getTemplate('wedding'), { title: 'Ana and Lee' }) };
const { photoY: editedPhotoY, ...editedFields } = edited.d;

test('a publish with the version updates the invitation and the version', async () => {
  const { client } = await setup();
  const cred = host();
  await client().publish(cred, party);
  const updated = await client().publish({ ...cred, version: 1 }, edited);
  assert.deepEqual(
    { updated: updated.data, opened: (await client().loadEvent(cred.id)).data },
    { updated: { version: 2, created: false }, opened: { t: 'wedding', d: editedFields } },
  );
});

test('a publish retried after a lost confirmation applies the newer fields to the same event', async () => {
  const { client } = await setup();
  const cred = host();
  await client().publish(cred, party);
  const retried = await client().publish(cred, edited);
  assert.deepEqual(
    { retried: retried.data, opened: (await client().loadEvent(cred.id)).data },
    { retried: { version: 2, created: false }, opened: { t: 'wedding', d: editedFields } },
  );
});

test('a publish with a stale version gets 409 with the current invitation', async () => {
  const { client } = await setup();
  const cred = host();
  await client().publish(cred, party);
  await client().publish({ ...cred, version: 1 }, edited);
  const stale = await client().publish({ ...cred, version: 1 }, party);
  const { error, ...current } = stale.data;
  assert.deepEqual(
    { ok: stale.ok, status: stale.status, current, message: stale.message === error },
    { ok: false, status: 409, current: { version: 2, t: 'wedding', d: editedFields }, message: true },
  );
});

test('two simultaneous publishes with the same version give one success and one 409', async () => {
  const { client } = await setup();
  const cred = host();
  await client().publish(cred, party);
  const results = await Promise.all([
    client().publish({ ...cred, version: 1 }, edited),
    client().publish({ ...cred, version: 1 }, party),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
});

test('a publish with another secret cannot change the invitation', async () => {
  const { client } = await setup();
  const cred = host();
  await client().publish(cred, party);
  const results = await Promise.all([
    client().publish({ ...cred, secret: newSecret() }, edited),
    client().publish({ ...cred, secret: newSecret(), version: 1 }, edited),
  ]);
  assert.deepEqual(
    { statuses: results.map((r) => r.status), opened: (await client().loadEvent(cred.id)).data },
    { statuses: [403, 403], opened: { t: 'birthday', d: partyFields } },
  );
});

test('an update of a missing invitation gets 404', async () => {
  const { client } = await setup();
  assert.equal((await client().publish({ ...host(), version: 1 }, party)).status, 404);
});

const guest = () => ({ id: newId(), secret: newSecret(), version: null });
const sam = { name: 'Sam', attending: true, partySize: 2, note: 'No nuts, please.\n<b>We arrive at 3.</b>' };
const ana = { name: 'Ana', attending: false, partySize: 0, note: '' };
const lee = { name: 'Lee', attending: true, partySize: 1, note: '' };
const answers = (list) =>
  list.data.responses.map(({ name, attending, partySize, note }) => ({ name, attending, partySize, note }));

// A published event; a separate browser, without the management secret, plays the guests.
async function publishedEvent() {
  const { client, raw } = await setup();
  const cred = host();
  await client().publish(cred, party);
  return { client, raw, cred, guests: client(newId()) };
}

test('the host sees every reply oldest first with the totals', async () => {
  const { client, cred, guests } = await publishedEvent();
  for (const reply of [sam, ana, lee]) await guests.saveReply(cred.id, guest(), reply);
  const list = await client().loadResponses(cred);
  assert.deepEqual(
    { answers: answers(list), totals: list.data.totals, t: list.data.t, version: list.data.version },
    {
      answers: [sam, ana, lee],
      totals: { responses: 3, yes: 2, no: 1, attending: 3 },
      t: 'birthday',
      version: 1,
    },
  );
});

test('a saved reply loads back with its edit secret', async () => {
  const { cred, guests } = await publishedEvent();
  const reply = guest();
  const saved = await guests.saveReply(cred.id, reply, sam);
  assert.deepEqual(
    { saved: saved.data, loaded: (await guests.loadReply(cred.id, reply)).data },
    { saved: { version: 1, created: true }, loaded: { ...sam, version: 1 } },
  );
});

test('a repeated reply submission keeps one response', async () => {
  const { client, cred, guests } = await publishedEvent();
  const reply = guest();
  await guests.saveReply(cred.id, reply, sam);
  await guests.saveReply(cred.id, reply, sam);
  assert.deepEqual(answers(await client().loadResponses(cred)), [sam]);
});

test('a reply retried after a lost confirmation applies the newer answer to the same response', async () => {
  const { client, cred, guests } = await publishedEvent();
  const reply = guest();
  await guests.saveReply(cred.id, reply, sam);
  const retried = await guests.saveReply(cred.id, reply, { ...sam, attending: false, partySize: 0 });
  assert.deepEqual(
    { retried: retried.data, answers: answers(await client().loadResponses(cred)) },
    { retried: { version: 2, created: false }, answers: [{ ...sam, attending: false, partySize: 0 }] },
  );
});

test('a guest changes and clears the note through the edit link', async () => {
  const { client, cred, guests } = await publishedEvent();
  const reply = guest();
  await guests.saveReply(cred.id, reply, sam);
  await guests.saveReply(cred.id, { ...reply, version: 1 }, { ...sam, note: 'Vegetarian, please.' });
  const changed = (await guests.loadReply(cred.id, reply)).data.note;
  await guests.saveReply(cred.id, { ...reply, version: 2 }, { ...sam, note: '' });
  assert.deepEqual(
    {
      changed,
      cleared: (await guests.loadReply(cred.id, reply)).data,
      answers: answers(await client().loadResponses(cred)),
    },
    { changed: 'Vegetarian, please.', cleared: { ...sam, note: '', version: 3 }, answers: [{ ...sam, note: '' }] },
  );
});

// A page loaded before the note existed sends no note field, so its edits leave the stored note alone.
test('an update without a note field keeps the stored note', async () => {
  const { cred, guests } = await publishedEvent();
  const reply = guest();
  await guests.saveReply(cred.id, reply, sam);
  const { note, ...withoutNote } = sam;
  await guests.saveReply(cred.id, { ...reply, version: 1 }, { ...withoutNote, name: 'Sam Lee' });
  assert.deepEqual((await guests.loadReply(cred.id, reply)).data, { ...sam, name: 'Sam Lee', version: 2 });
});

test('a reply with a stale version gets 409 with the current answer', async () => {
  const { cred, guests } = await publishedEvent();
  const reply = guest();
  await guests.saveReply(cred.id, reply, sam);
  await guests.saveReply(cred.id, { ...reply, version: 1 }, lee);
  const stale = await guests.saveReply(cred.id, { ...reply, version: 1 }, ana);
  const { error, ...current } = stale.data;
  assert.deepEqual(
    { status: stale.status, current, message: stale.message === error },
    { status: 409, current: { version: 2, ...lee }, message: true },
  );
});

test('a withdrawn reply leaves the host list and totals, and its edit link no longer loads it', async () => {
  const { client, cred, guests } = await publishedEvent();
  const reply = guest();
  await guests.saveReply(cred.id, reply, sam);
  await guests.saveReply(cred.id, guest(), lee);
  const withdrawn = await guests.withdrawReply(cred.id, { ...reply, version: 1 });
  const list = await client().loadResponses(cred);
  assert.deepEqual(
    {
      status: withdrawn.status,
      answers: answers(list),
      totals: list.data.totals,
      loaded: (await guests.loadReply(cred.id, reply)).status,
    },
    { status: 204, answers: [lee], totals: { responses: 1, yes: 1, no: 0, attending: 1 }, loaded: 404 },
  );
});

test('a withdrawn reply leaves no stored row or note', async () => {
  const { cred, guests } = await publishedEvent();
  const reply = guest();
  const note = `Allergic to peanuts ${newId()}`;
  await guests.saveReply(cred.id, reply, { ...sam, note });
  await guests.withdrawReply(cred.id, { ...reply, version: 1 });
  const db = await shared;
  assert.equal((await db.query('select 1 from responses where id = $1 or note = $2', [reply.id, note])).rows.length, 0);
});

test('a stored reply without a note gets an empty note, and the database refuses a note over 300 characters', async () => {
  const { cred } = await publishedEvent();
  const db = await shared;
  const insert = (id, note) =>
    db.query(
      `insert into responses (id, event_id, secret_hash, name, attending, party_size${note === undefined ? '' : ', note'})
       values ($1, $2, 'x', 'Sam', true, 1${note === undefined ? '' : ', $3'})`,
      note === undefined ? [id, cred.id] : [id, cred.id, note],
    );
  const id = newId();
  await insert(id);
  await insert(newId(), 'a'.repeat(300));
  await assert.rejects(insert(newId(), 'a'.repeat(301)));
  assert.equal((await db.query('select note from responses where id = $1', [id])).rows[0].note, '');
});

test('a withdrawal with a stale version gets 409 with the current answer and keeps the reply', async () => {
  const { client, cred, guests } = await publishedEvent();
  const reply = guest();
  await guests.saveReply(cred.id, reply, sam);
  await guests.saveReply(cred.id, { ...reply, version: 1 }, lee);
  const stale = await guests.withdrawReply(cred.id, { ...reply, version: 1 });
  const { error, ...current } = stale.data;
  assert.deepEqual(
    { status: stale.status, current, answers: answers(await client().loadResponses(cred)) },
    { status: 409, current: { version: 2, ...lee }, answers: [lee] },
  );
});

test('a withdrawal repeated after a lost confirmation succeeds', async () => {
  const { cred, guests } = await publishedEvent();
  const reply = guest();
  await guests.saveReply(cred.id, reply, sam);
  reply.version = 1;
  const first = await guests.withdrawReply(cred.id, reply);
  const repeated = await guests.withdrawReply(cred.id, reply);
  assert.deepEqual([first.status, repeated.status], [204, 204]);
});

test('an edit secret changes and reads only its own response', async () => {
  const { client, cred, guests } = await publishedEvent();
  const first = guest();
  const second = guest();
  await guests.saveReply(cred.id, first, sam);
  await guests.saveReply(cred.id, second, ana);
  const stolen = { ...first, secret: second.secret };
  const results = await Promise.all([
    guests.saveReply(cred.id, stolen, lee),
    guests.saveReply(cred.id, { ...stolen, version: 1 }, lee),
    guests.loadReply(cred.id, stolen),
    guests.withdrawReply(cred.id, { ...stolen, version: 1 }),
  ]);
  assert.deepEqual(
    { statuses: results.map((r) => r.status), answers: answers(await client().loadResponses(cred)) },
    { statuses: [403, 403, 403, 403], answers: [sam, ana] },
  );
});

test('a response id under another event cannot be read, changed or withdrawn there', async () => {
  const { client, cred, guests } = await publishedEvent();
  const other = await publishedEvent();
  const reply = guest();
  await guests.saveReply(cred.id, reply, sam);
  const results = await Promise.all([
    guests.saveReply(other.cred.id, reply, lee),
    guests.loadReply(other.cred.id, reply),
    guests.withdrawReply(other.cred.id, { ...reply, version: 1 }),
  ]);
  assert.deepEqual(
    { statuses: results.map((r) => r.status), answers: answers(await client().loadResponses(cred)) },
    { statuses: [403, 403, 403], answers: [sam] },
  );
});

test('the public id or a wrong secret cannot list replies or delete the invitation', async () => {
  const { client, raw, cred, guests } = await publishedEvent();
  await guests.saveReply(cred.id, guest(), sam);
  const wrong = { ...cred, secret: newSecret() };
  const results = await Promise.all([
    guests.loadResponses(wrong),
    guests.deleteEvent(wrong),
    raw(`/api/events/${cred.id}/responses`),
    raw(`/api/events/${cred.id}`, { method: 'DELETE' }),
  ]);
  assert.deepEqual(
    { statuses: results.map((r) => r.status), answers: answers(await client().loadResponses(cred)) },
    { statuses: [403, 403, 401, 401], answers: [sam] },
  );
});

test('deleting the invitation removes it and its replies', async () => {
  const { client, cred, guests } = await publishedEvent();
  const reply = guest();
  await guests.saveReply(cred.id, reply, sam);
  const deleted = await client().deleteEvent(cred);
  const gone = await Promise.all([
    guests.loadEvent(cred.id),
    client().loadResponses(cred),
    guests.loadReply(cred.id, reply),
    guests.saveReply(cred.id, { ...reply, version: 1 }, lee),
    guests.saveReply(cred.id, guest(), lee),
    guests.withdrawReply(cred.id, { ...reply, version: 1 }),
  ]);
  assert.deepEqual([deleted.status, ...gone.map((r) => r.status)], [204, 404, 404, 404, 404, 404, 404]);
});

test('no response body or header carries a secret, its hash or a reply id, and none is cached', async () => {
  const { raw } = await setup();
  const seen = [];
  const recording = createClient(async (path, init) => {
    const response = await raw(path, init);
    seen.push({ text: await response.clone().text(), headers: [...response.headers].join(' '), response });
    return response;
  });
  const cred = host();
  const reply = guest();
  await recording.publish(cred, party);
  await recording.publish({ ...cred, version: 1 }, edited);
  await recording.publish({ ...cred, version: 1 }, party);
  await recording.loadEvent(cred.id);
  await recording.saveReply(cred.id, reply, sam);
  await recording.saveReply(cred.id, { ...reply, version: 1 }, lee);
  await recording.saveReply(cred.id, { ...reply, version: 1 }, ana);
  await recording.loadReply(cred.id, reply);
  await recording.withdrawReply(cred.id, { ...reply, version: 1 });
  await recording.withdrawReply(cred.id, { ...reply, version: 2 });
  await recording.withdrawReply(cred.id, { ...reply, version: 2 });
  await recording.loadResponses(cred);
  await recording.deleteEvent(cred);
  const leaks = [cred.secret, reply.secret, sha256(cred.secret), sha256(reply.secret), reply.id, 'secret'];
  assert.deepEqual(
    {
      leaked: seen.filter(({ text, headers }) => leaks.some((l) => text.includes(l) || headers.includes(l))).length,
      cached: seen.filter(({ response }) => response.headers.get('cache-control') !== 'no-store').length,
    },
    { leaked: 0, cached: 0 },
  );
});

const bearer = (secret) => ({ authorization: `Bearer ${secret}` });
const put = (body, headers = {}) => ({
  method: 'PUT',
  headers: { 'content-type': 'application/json', ...headers },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

test('malformed requests get their status and an error message', async () => {
  const { raw, cred } = await publishedEvent();
  const auth = bearer(cred.secret);
  const event = `/api/events/${cred.id}`;
  const reply = `${event}/responses/${newId()}`;
  const fields = { t: 'birthday', d: partyFields };
  const withField = (change) => ({ ...fields, d: { ...partyFields, ...change } });
  const cases = {
    'an unknown path': [404, '/api/guests', {}],
    'a path below a reply': [404, `${reply}/x`, {}],
    'a POST to an event': [405, event, { method: 'POST', headers: auth, body: '{}' }],
    'a DELETE of the response list': [405, `${event}/responses`, { method: 'DELETE', headers: auth }],
    'a short event id': [400, '/api/events/abc', {}],
    'a response id with a character outside base64url': [400, `${event}/responses/${'+'.repeat(22)}`, {}],
    'no Authorization header': [401, event, put(fields)],
    'a Basic Authorization header': [401, event, put(fields, { authorization: `Basic ${cred.secret}` })],
    'a short secret': [401, event, put(fields, bearer(cred.secret.slice(1)))],
    'a body that is not JSON': [400, event, put('{t:', auth)],
    'a JSON array body': [400, event, put('[]', auth)],
    'a body over 8 KB': [413, event, put({ ...fields, pad: 'x'.repeat(8 * 1024) }, auth)],
    'a version of 0': [400, event, put({ ...fields, version: 0 }, auth)],
    'a version given as text': [400, event, put({ ...fields, version: '1' }, auth)],
    'an unknown template': [400, event, put({ ...fields, t: 'picnic' }, auth)],
    'a title over its limit': [400, event, put(withField({ title: 'x'.repeat(49) }), auth)],
    'an impossible date': [400, event, put(withField({ date: '2026-02-30' }), auth)],
    'an accent outside the palette': [400, event, put(withField({ accent: '#123456' }), auth)],
    'a photo position': [400, event, put(withField({ photoY: 20 }), auth)],
    'a missing field': [400, event, put(withField({ venue: undefined }), auth)],
    'a field that is not text': [400, event, put(withField({ venue: 7 }), auth)],
    'a reply with an empty name': [400, reply, put({ ...sam, name: ' ' }, bearer(newSecret()))],
    'a reply with a party of 11': [400, reply, put({ ...sam, partySize: 11 }, bearer(newSecret()))],
    'a reply with a note of 301 characters': [400, reply, put({ ...sam, note: 'x'.repeat(301) }, bearer(newSecret()))],
    'a reply without an answer': [400, reply, put({ ...sam, attending: undefined }, bearer(newSecret()))],
    'a withdrawal without a version': [400, reply, { ...put({}, bearer(newSecret())), method: 'DELETE' }],
    'a withdrawal without Authorization': [401, reply, { ...put({ version: 1 }), method: 'DELETE' }],
  };
  const results = {};
  for (const [label, [, path, init]] of Object.entries(cases)) {
    const response = await raw(path, init);
    const body = await response.json();
    results[label] = [response.status, typeof body.error === 'string' && body.error.length > 0];
  }
  const expected = Object.fromEntries(Object.entries(cases).map(([label, [status]]) => [label, [status, true]]));
  assert.deepEqual(results, expected);
});

test('the 21st invitation from one connection in a day gets 429 and is not stored', async () => {
  const { client } = await setup();
  const browser = client();
  for (let i = 0; i < 20; i += 1) assert.equal((await browser.publish(host(), party)).status, 201);
  const refused = host();
  const result = await browser.publish(refused, party);
  assert.deepEqual(
    {
      refused: result.status,
      stored: (await browser.loadEvent(refused.id)).status,
      elsewhere: (await client(newId()).publish(host(), party)).status,
    },
    { refused: 429, stored: 404, elsewhere: 201 },
  );
});

// The quota tests read creation_quota directly, because its stored keys are the privacy contract.
const quotaKeys = async (db) => (await db.query('select client from creation_quota', [])).rows;
test('the daily invitation quota stores a key that is not the sha256 hash of the IP address', async () => {
  const db = await openDatabase();
  after(() => db.close());
  const { client } = await setup(db);
  await client('203.0.113.7').publish(host(), party);
  const keys = await quotaKeys(db);
  assert.deepEqual(
    keys.map(({ client: key }) => [/^[0-9a-f]{64}$/.test(key), key === sha256('203.0.113.7')]),
    [[true, false]],
  );
});

test('a new day deletes the earlier counts and keys the same IP address differently', async () => {
  const db = await openDatabase();
  after(() => db.close());
  const { client } = await setup(db);
  await client('203.0.113.7').publish(host(), party);
  const [yesterday] = await quotaKeys(db);
  // Moves every stored day back by one, as if the first invitation was published yesterday.
  for (const table of ['creation_quota', 'quota_salts']) await db.query(`update ${table} set day = day - 1`, []);
  await client('203.0.113.7').publish(host(), party);
  const keys = await quotaKeys(db);
  assert.deepEqual({ rows: keys.length, rekeyed: keys[0].client !== yesterday.client }, { rows: 1, rekeyed: true });
});

// The retention job deletes an invitation, with its replies, 91 days after the later of its event date and its
// last change. dayOffset(n) is the UTC date n days from today.
const dayOffset = (days) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

test('the retention job deletes an invitation and its replies 91 days after the later of the event date and the last change', async () => {
  const db = await openDatabase();
  after(() => db.close());
  const { client, raw } = await setup(db);
  const browser = client();
  // idle is how many days ago the invitation was last changed.
  const cases = {
    'event 91 days ago': { date: dayOffset(-91), idle: 91, deleted: true },
    'event 90 days ago': { date: dayOffset(-90), idle: 90, deleted: false },
    'event tomorrow': { date: dayOffset(1), idle: 200, deleted: false },
    'no date, changed 91 days ago': { date: '', idle: 91, deleted: true },
    'no date, changed 90 days ago': { date: '', idle: 90, deleted: false },
    'event 200 days ago, changed today': { date: dayOffset(-200), idle: 0, deleted: false },
  };
  const creds = {};
  for (const [label, { date, idle }] of Object.entries(cases)) {
    creds[label] = host();
    await browser.publish(creds[label], { t: 'birthday', d: makeInviteData(getTemplate('birthday'), { date }) });
    await db.query('update events set updated_at = now() - make_interval(days => $2) where id = $1', [
      creds[label].id,
      idle,
    ]);
    await browser.saveReply(creds[label].id, guest(), sam);
  }

  const run = await raw('/api/retention');
  const gone = {};
  for (const label of Object.keys(cases)) gone[label] = (await browser.loadEvent(creds[label].id)).status === 404;
  const replies = (await db.query('select count(*)::int as n from responses', [])).rows[0].n;
  assert.deepEqual(
    { status: run.status, body: await run.json(), gone, replies },
    {
      status: 200,
      body: { deleted: 2 },
      gone: Object.fromEntries(Object.entries(cases).map(([label, { deleted }]) => [label, deleted])),
      replies: 4,
    },
  );
});

test('the 201st reply to an invitation gets 429, and existing replies stay editable', async () => {
  const { client, cred, guests } = await publishedEvent();
  const first = guest();
  await guests.saveReply(cred.id, first, sam);
  for (let i = 1; i < 200; i += 1) await guests.saveReply(cred.id, guest(), lee);
  const results = await Promise.all([
    guests.saveReply(cred.id, guest(), ana),
    guests.saveReply(cred.id, { ...first, version: 1 }, ana),
  ]);
  assert.deepEqual(
    { statuses: results.map((r) => r.status), totals: (await client().loadResponses(cred)).data.totals },
    { statuses: [429, 200], totals: { responses: 200, yes: 199, no: 1, attending: 199 } },
  );
});

// PGlite runs one transaction at a time, so these pass without the row locks too. They hold the result that the
// locks in putReply give on Postgres, where transactions overlap.
test('two simultaneous new replies at the 200-reply limit store one of them', async () => {
  const { client, cred, guests } = await publishedEvent();
  for (let i = 0; i < 199; i += 1) await guests.saveReply(cred.id, guest(), lee);
  const results = await Promise.all([guests.saveReply(cred.id, guest(), sam), guests.saveReply(cred.id, guest(), ana)]);
  assert.deepEqual(
    {
      statuses: results.map((r) => r.status).sort(),
      stored: (await client().loadResponses(cred)).data.totals.responses,
    },
    { statuses: [201, 429], stored: 200 },
  );
});

test('two simultaneous edits of one reply with the same version give one success and one 409', async () => {
  const { cred, guests } = await publishedEvent();
  const reply = guest();
  await guests.saveReply(cred.id, reply, sam);
  const results = await Promise.all([
    guests.saveReply(cred.id, { ...reply, version: 1 }, lee),
    guests.saveReply(cred.id, { ...reply, version: 1 }, ana),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
});

test('a closed database gives 503 with the fixed message, and the client reports the failure', async () => {
  const db = await openDatabase();
  await db.close();
  const { client } = await setup(db);
  const result = await client().publish(host(), party);
  assert.deepEqual(
    { ok: result.ok, status: result.status, message: result.message },
    {
      ok: false,
      status: 503,
      message: 'Storage is unavailable right now. Nothing was changed. Try again in a minute.',
    },
  );
});

test('a network failure resolves with status 0 and a message', async () => {
  const offline = createClient(() => Promise.reject(new TypeError('Failed to fetch')));
  const result = await offline.loadEvent(newId());
  assert.deepEqual(
    { ok: result.ok, status: result.status, message: typeof result.message },
    { ok: false, status: 0, message: 'string' },
  );
});

test('private links read back to the credential they carry', () => {
  const [eventId, id, secret] = [newId(), newId(), newSecret()];
  const origin = 'https://petalpost.example';
  const reply = responseLink(origin, eventId, id, secret);
  const roReply = responseLink(origin, eventId, id, secret, 'ro');
  const manage = manageLink(origin, eventId, secret);
  assert.deepEqual(
    {
      reply: [reply.split('#')[0], readCredential(reply.slice(reply.indexOf('#')), 'r=')],
      roReply: [roReply.split('#')[0], readCredential(roReply.slice(roReply.indexOf('#')), 'r=')],
      manage: [manage.split('#')[0], readCredential(manage.slice(manage.indexOf('#')), '')],
      event: eventLink(origin, eventId),
      roEvent: eventLink(origin, eventId, 'ro'),
      roEditor: editorPage(origin, 'ro'),
      roManage: manageLink(origin, eventId, secret, 'ro').split('#')[0],
    },
    {
      reply: [`https://petalpost.example/e/${eventId}`, { id, secret }],
      roReply: [`https://petalpost.example/ro/e/${eventId}`, { id, secret }],
      manage: ['https://petalpost.example/manage.html', { id: eventId, secret }],
      event: `https://petalpost.example/e/${eventId}`,
      roEvent: `https://petalpost.example/ro/e/${eventId}`,
      roEditor: 'https://petalpost.example/ro/editor.html',
      roManage: 'https://petalpost.example/ro/manage.html',
    },
  );
});

test('a Romanian client receives Romanian API and network error messages', async () => {
  const { raw } = await setup();
  const roClient = createClient(
    (path, init = {}) => raw(path, { ...init, headers: { ...init.headers, 'x-real-ip': newId() } }),
    { lang: 'ro' },
  );
  const missing = await roClient.loadEvent(newId());
  const offline = createClient(() => Promise.reject(new TypeError('Failed to fetch')), { lang: 'ro' });
  const down = await offline.loadEvent(newId());
  assert.deepEqual(
    { missingStatus: missing.status, missing: missing.message, downStatus: down.status, down: down.message },
    {
      missingStatus: 404,
      missing: 'Această invitație nu există. Este posibil să fi fost ștearsă.',
      downStatus: 0,
      down: 'Petalpost nu a putut fi contactat. Verifică conexiunea și încearcă din nou.',
    },
  );
});

test('the /e/{id} route renders dynamic OG tags, escapes special text and handles HEAD, 404, 405 and 503', async () => {
  const db = await (shared ??= openDatabase());
  const { client } = await setup(db);
  const eventPage = createEventPage(db);
  const cred = host();
  const special = {
    t: 'birthday',
    d: makeInviteData(getTemplate('birthday'), {
      title: 'A & "B" <3> $& $1',
      date: '2026-12-12',
      time: '14:00',
      venue: 'O\'Brien & "Friends"',
    }),
  };
  await client().publish(cred, special);

  const ok = await eventPage(new Request(`https://petalpost.test/e/${cred.id}`));
  const html = await ok.text();
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'text/html; charset=utf-8');
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  assert.match(html, /<title>A &amp; &quot;B&quot; &lt;3&gt; \$&amp; \$1 \| Petalpost<\/title>/);
  assert.match(
    html,
    /<meta property="og:title" content="A &amp; &quot;B&quot; &lt;3&gt; \$&amp; \$1 \| Petalpost" \/>/,
  );
  assert.match(
    html,
    /<meta property="og:description" content="Saturday, December 12, 2026 at 2:00 PM · O&#39;Brien &amp; &quot;Friends&quot;" \/>/,
  );
  assert.match(html, new RegExp(`<meta property="og:url" content="https://www\\.petalpost\\.ro/e/${cred.id}" />`));
  assert.match(html, /<meta name="robots" content="noindex, nofollow" \/>/);
  assert.doesNotMatch(html, /<link rel="canonical"/);

  const head = await eventPage(new Request(`https://petalpost.test/e/${cred.id}`, { method: 'HEAD' }));
  assert.deepEqual([head.status, head.headers.get('cache-control'), await head.text()], [200, 'no-store', '']);

  const missing = await eventPage(new Request(`https://petalpost.test/e/${newId()}`));
  const missingHtml = await missing.text();
  assert.equal(missing.status, 404);
  assert.match(missingHtml, /<title>This invitation does not exist \| Petalpost<\/title>/);
  assert.match(missingHtml, /<meta name="robots" content="noindex, nofollow" \/>/);

  const badId = await eventPage(new Request('https://petalpost.test/e/not-valid'));
  assert.equal(badId.status, 404);

  const post = await eventPage(new Request(`https://petalpost.test/e/${cred.id}`, { method: 'POST' }));
  assert.deepEqual([post.status, post.headers.get('allow')], [405, 'GET, HEAD']);

  const roOk = await eventPage(new Request(`https://petalpost.test/ro/e/${cred.id}`));
  const roHtml = await roOk.text();
  assert.equal(roOk.status, 200);
  assert.match(roHtml, /<html lang="ro">/);
  assert.match(roHtml, /ora 14:00/);
  assert.match(roHtml, new RegExp(`<meta property="og:url" content="https://www\\.petalpost\\.ro/ro/e/${cred.id}" />`));
  assert.doesNotMatch(roHtml, /<link rel="alternate"/);

  const roMissing = await eventPage(new Request(`https://petalpost.test/ro/e/${newId()}`));
  assert.equal(roMissing.status, 404);
  assert.match(await roMissing.text(), /<title>Această invitație nu există \| Petalpost<\/title>/);

  const closedDb = await openDatabase();
  await closedDb.close();
  const down = await createEventPage(closedDb)(new Request(`https://petalpost.test/e/${cred.id}`));
  assert.equal(down.status, 503);
  assert.equal(down.headers.get('cache-control'), 'no-store');
  assert.match(await down.text(), /<title>The invitation could not be loaded \| Petalpost<\/title>/);
});

test('the /e/{id} route names the template link preview image, and the generic image when it cannot', async () => {
  const db = await (shared ??= openDatabase());
  const { client } = await setup(db);
  // The og:image address and og:image:alt text that the page at path names.
  const image = async (path, pageDb = db) => {
    const html = await (await createEventPage(pageDb)(new Request(`https://petalpost.test${path}`))).text();
    return [
      html.match(/<meta property="og:image" content="([^"]*)" \/>/)[1],
      html.match(/<meta\s+property="og:image:alt"\s+content="([^"]*)"\s*\/>/)[1],
      html.match(/<meta property="og:image:width" content="(\d+)" \/>/)[1],
      html.match(/<meta property="og:image:height" content="(\d+)" \/>/)[1],
    ];
  };
  const cred = host();
  const title = 'A & "B" <3> $& $1';
  await client().publish(cred, { t: 'noir-laurel', d: makeInviteData(getTemplate('noir-laurel'), { title }) });
  const escaped = 'A &amp; &quot;B&quot; &lt;3&gt; $&amp; $1';
  assert.deepEqual(await image(`/e/${cred.id}`), [
    'https://www.petalpost.ro/previews/noir-laurel.jpg',
    `Invitation: ${escaped}`,
    '1200',
    '630',
  ]);
  assert.deepEqual(await image(`/ro/e/${cred.id}`), [
    'https://www.petalpost.ro/previews/noir-laurel.jpg',
    `Invitație: ${escaped}`,
    '1200',
    '630',
  ]);

  const english = [
    'https://www.petalpost.ro/og-image.png',
    'Petalpost: three hand-drawn invitation cards beside the words Your day, your invite.',
    '1200',
    '630',
  ];
  const romanian = [
    'https://www.petalpost.ro/ro/og-image.png',
    'Petalpost: trei invitații ilustrate alături de mesajul Ziua ta, invitația ta.',
    '1200',
    '630',
  ];
  assert.deepEqual(await image(`/e/${newId()}`), english);
  assert.deepEqual(await image(`/ro/e/${newId()}`), romanian);

  const closedDb = await openDatabase();
  await closedDb.close();
  assert.deepEqual(await image(`/e/${cred.id}`, closedDb), english);
  assert.deepEqual(await image(`/ro/e/${cred.id}`, closedDb), romanian);

  await db.query(`update events set t = 'retired-template' where id = $1`, [cred.id]);
  assert.deepEqual(await image(`/e/${cred.id}`), english);
  assert.deepEqual(await image(`/ro/e/${cred.id}`), romanian);
});
