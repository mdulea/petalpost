// Fails when the invitation modes break in the RSVP API, in English and Romanian. Checks: a guest-list invitation
// opens from another browser with its mode, and an open one with the open mode; the invitation link of a
// guest-list invitation refuses a new reply and a reply update with the message of the request language and stores
// nothing, while an open invitation takes the reply; a guest-list invitation refuses a publish or update without an
// event date while an open invitation allows none; a publish without a mode, as from a page loaded before
// invitations had modes, makes an open invitation that takes replies; an update keeps the stored mode whatever mode
// it sends or when it sends none; a publish with an unknown mode is refused; the management read of a guest-list
// invitation gives its mode and no replies; 300 maximum-length names fit across requests and the API refuses more.
// Each test uses fresh random ids and client IPs in the shared migrated in-memory PGlite database of
// tests/api-setup.js.
// Run: pnpm exec node tests/check-guest-list.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeInviteData } from '../public/js/invite.js';
import { newId } from '../public/js/rsvp.js';
import { getTemplate } from '../public/js/templates.js';
import { guest, host, setup } from './api-setup.js';

const invitation = (mode) => ({
  t: 'birthday',
  d: makeInviteData(getTemplate('birthday'), { title: 'Zoë turns 7', mode }),
});
const sam = { name: 'Sam', attending: true, partySize: 2, note: '' };
// The refusal of a reply through the invitation link of a guest-list invitation, in each request language.
const REFUSED = {
  en: 'This invitation takes replies only through the personal links the host sends.',
  ro: 'Această invitație primește confirmări doar prin linkurile personale trimise de gazdă.',
};

// The invitation fields that a page loaded before invitations had modes sends, without photoY and mode.
const { photoY: _photoY, mode: _mode, ...unmoded } = invitation('open').d;

// Publishes the invitation in the mode in lang and returns the host's credentials and a guest's client in lang.
async function published(mode, lang) {
  const { client, raw } = await setup();
  const cred = host();
  await client(newId(), lang).publish(cred, invitation(mode));
  return { client, raw, cred, guests: client(newId(), lang) };
}

// A PUT of the hand-made invitation body with the host's secret.
const putEvent = (raw, cred, body) =>
  raw(`/api/events/${cred.id}`, {
    method: 'PUT',
    headers: { authorization: `Bearer ${cred.secret}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

for (const lang of ['en', 'ro']) {
  test(`in ${lang}, each invitation opens from another browser with its mode`, async () => {
    const opened = {};
    for (const mode of ['open', 'guestList']) {
      const { cred, guests } = await published(mode, lang);
      opened[mode] = (await guests.loadEvent(cred.id)).data.d.mode;
    }
    assert.deepEqual(opened, { open: 'open', guestList: 'guestList' });
  });

  test(`in ${lang}, the invitation link of a guest-list invitation refuses a reply and stores nothing`, async () => {
    const { client, cred, guests } = await published('guestList', lang);
    const created = await guests.saveReply(cred.id, guest(), sam);
    const updated = await guests.saveReply(cred.id, { ...guest(), version: 1 }, sam);
    const list = await client().loadResponses(cred);
    assert.deepEqual(
      {
        created: [created.status, created.message],
        updated: [updated.status, updated.message],
        replies: list.data.responses,
      },
      {
        created: [403, REFUSED[lang]],
        updated: [403, REFUSED[lang]],
        replies: [],
      },
    );
  });

  test(`in ${lang}, an open invitation takes a reply through its invitation link`, async () => {
    const { client, cred, guests } = await published('open', lang);
    const saved = await guests.saveReply(cred.id, guest(), sam);
    const list = await client().loadResponses(cred);
    assert.deepEqual(
      { status: saved.status, names: list.data.responses.map((r) => r.name) },
      { status: 201, names: ['Sam'] },
    );
  });

  test(`in ${lang}, the management read of a guest-list invitation gives its mode and no replies`, async () => {
    const { client, cred } = await published('guestList', lang);
    const { data } = await client(newId(), lang).loadResponses(cred);
    assert.deepEqual(
      { mode: data.d.mode, responses: data.responses, totals: data.totals },
      { mode: 'guestList', responses: [], totals: { responses: 0, yes: 0, no: 0, attending: 0 } },
    );
  });
}

test('a publish without a mode makes an open invitation that takes replies', async () => {
  const { raw, client } = await setup();
  const cred = host();
  const created = await putEvent(raw, cred, { t: 'birthday', d: unmoded });
  const saved = await client(newId()).saveReply(cred.id, guest(), sam);
  assert.deepEqual(
    { created: created.status, mode: (await client().loadEvent(cred.id)).data.d.mode, reply: saved.status },
    { created: 201, mode: 'open', reply: 201 },
  );
});

test('an update keeps the stored mode whatever mode it sends or when it sends none', async () => {
  const kept = {};
  for (const [stored, sent] of [
    ['guestList', 'open'],
    ['guestList', undefined],
    ['open', 'guestList'],
  ]) {
    const { raw, client, cred } = await published(stored, 'en');
    const d = sent ? { ...unmoded, mode: sent, title: 'Changed' } : { ...unmoded, title: 'Changed' };
    const updated = await putEvent(raw, cred, { t: 'birthday', d, version: 1 });
    const { data } = await client().loadEvent(cred.id);
    kept[`${stored} sent ${sent}`] = [updated.status, data.d.title, data.d.mode];
  }
  assert.deepEqual(kept, {
    'guestList sent open': [200, 'Changed', 'guestList'],
    'guestList sent undefined': [200, 'Changed', 'guestList'],
    'open sent guestList': [200, 'Changed', 'open'],
  });
});

const DATE_REQUIRED = {
  en: 'Add an event date before publishing a guest-list invitation.',
  ro: 'Adaugă data evenimentului înainte de a publica o invitație cu listă de invitați.',
};

test('a publish with an unknown mode is refused and stores nothing', async () => {
  const { raw, client } = await setup();
  const cred = host();
  const refused = await putEvent(raw, cred, { t: 'birthday', d: { ...unmoded, mode: 'private' } });
  assert.deepEqual([refused.status, (await client().loadEvent(cred.id)).status], [400, 404]);
});

test('300 maximum-length names fit across requests and a full guest list refuses another party', async () => {
  const { client, cred } = await published('guestList', 'en');
  const api = client();
  const entries = Array.from({ length: 300 }, (_, i) => ({
    id: newId(),
    name: String(i).padStart(3, '0') + '🎉'.repeat(77),
  }));
  const added = await api.addParties(cred, entries, 3);
  const replayed = await api.addParties(cred, entries, 3);
  const extra = await api.addParty(cred, newId(), { name: 'Extra', defaultSeats: 3 });
  const { data } = await api.loadResponses(cred);
  assert.deepEqual(
    [added.ok, replayed.ok, extra.status, extra.message, data.parties.map((p) => [p.name, p.defaultSeats]).sort()],
    [true, true, 429, 'The guest list can have up to 300 parties.', entries.map(({ name }) => [name, 3])],
  );
});

for (const lang of ['en', 'ro']) {
  test(`in ${lang}, a guest-list invitation refuses a publish or update without a date`, async () => {
    const { client } = await setup();
    const hostClient = client(newId(), lang);
    const missingDate = host();
    const refusedCreate = await hostClient.publish(missingDate, {
      t: 'birthday',
      d: makeInviteData(getTemplate('birthday'), { title: 'No date', mode: 'guestList', date: '' }),
    });
    const stored = await hostClient.loadEvent(missingDate.id);

    const live = host();
    const created = await hostClient.publish(live, invitation('guestList'));
    const refusedUpdate = await hostClient.publish(
      { ...live, version: created.data.version },
      { t: 'birthday', d: makeInviteData(getTemplate('birthday'), { title: 'Cleared', mode: 'guestList', date: '' }) },
    );

    const openNoDate = host();
    const openCreated = await hostClient.publish(openNoDate, {
      t: 'birthday',
      d: makeInviteData(getTemplate('birthday'), { title: 'Open no date', mode: 'open', date: '' }),
    });

    assert.deepEqual(
      {
        refusedCreate: [refusedCreate.status, refusedCreate.message],
        stored: stored.status,
        refusedUpdate: [refusedUpdate.status, refusedUpdate.message],
        openCreated: openCreated.status,
      },
      {
        refusedCreate: [400, DATE_REQUIRED[lang]],
        stored: 404,
        refusedUpdate: [400, DATE_REQUIRED[lang]],
        openCreated: 201,
      },
    );
  });
}
