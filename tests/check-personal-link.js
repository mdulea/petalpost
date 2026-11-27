// Checks party creation with default and explicit languages, personal access, opened times, view link read-only access,
// one versioned reply, and withdrawal through the API in both languages.
// The management tracker can preview an older party before it opens a personal link.
// Also checks replies above default seats, host seat edits and whole-list seat totals.
// Checks that revoking or regenerating a link blocks old guest access and keeps replies and tracker totals.
// A passkey session can read the guest list. Adding parties and changing links need the management secret.
// A host can rename a party and delete it with its reply. The guest credential cannot manage the party.
// Only a host credential can set a bounded update, and only on a guest-list invitation. The update reaches the tracker,
// personal link and view link reads but not the public read, survives a concurrent publish, and the host removes it.
// Saving an update keeps the invitation version and moves the last change time.
// Missing-party host actions (link change, host reply edit, table assignment) return 404 partyMissing rather than the
// guest personal-link error, open-mode invitations refuse host party mutations with 403, editor republish preserves all
// tracker settings (mode, deadline, updateNotice, seatingPublished), and tracker snapshot reads tolerate concurrent
// party edits while backfilling older view hashes.
// Run: pnpm exec node --test tests/check-personal-link.js
import assert from 'node:assert/strict';
import { createHash, createHmac } from 'node:crypto';
import { test } from 'node:test';
import { partyTotals } from '../public/js/guest-list.js';
import { newId, partyLinkSecret, partyStatus, readCredential, viewLink, viewLinkSecret } from '../public/js/rsvp.js';
import { guestListEvent, host, party, setup } from './api-setup.js';
import { authenticator } from './passkey-authenticator.js';

test('only a host can set a bounded update on a guest-list invitation', async () => {
  const { client, raw } = await setup();
  const tracker = client();
  const cred = host();
  const open = host();
  await tracker.publish(open, party);
  await tracker.publish(cred, { ...party, d: { ...party.d, mode: 'guestList' } });
  const id = newId();
  await tracker.addParty(cred, id, { name: 'Sam', defaultSeats: 2 });
  const secret = await partyLinkSecret(cred.secret, id, 'personal');
  const patch = (updateNotice) =>
    raw(`/api/events/${cred.id}`, {
      method: 'PATCH',
      headers: { authorization: `Bearer ${cred.secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({ updateNotice }),
    });
  assert.equal((await patch('x'.repeat(500))).status, 204);
  assert.equal((await patch('🎉'.repeat(500))).status, 204);
  const tooLong = await tracker.saveUpdate(cred, 'x'.repeat(501));
  assert.deepEqual([tooLong.status, tooLong.message], [400, 'Enter an update of 1 to 500 characters.']);
  for (const invalid of ['', '   ', '🎉'.repeat(501), 'a\tb', 'a\x07b', 1, '\0', '\uD800', undefined])
    assert.equal((await patch(invalid)).status, 400);
  assert.equal((await tracker.saveUpdate({ ...cred, secret }, 'Guest text')).status, 403);
  assert.equal((await tracker.saveUpdate(open, 'Open invitation text')).status, 403);
  assert.equal((await tracker.loadResponses(cred)).data.updateNotice, '🎉'.repeat(500));
});

test('saving an update keeps the invitation version and moves the last change time', async () => {
  const { client, db } = await setup();
  const tracker = client();
  const cred = host();
  await tracker.publish(cred, { ...party, d: { ...party.d, mode: 'guestList' } });
  await db.query("update events set updated_at = now() - interval '30 days' where id = $1", [cred.id]);
  await tracker.saveUpdate(cred, 'The party starts at 19:00.');
  const event = (
    await db.query("select version, updated_at > now() - interval '1 day' as fresh from events where id = $1", [
      cred.id,
    ])
  ).rows[0];
  assert.deepEqual(event, { version: 1, fresh: true });
});

test('the latest update reaches both party links and survives an invitation edit until the host removes it', async () => {
  const { client } = await setup();
  const tracker = client();
  const cred = host();
  const invite = { ...party, d: { ...party.d, mode: 'guestList' } };
  cred.version = (await tracker.publish(cred, invite)).data.version;
  const id = newId();
  await tracker.addParty(cred, id, { name: 'Sam', defaultSeats: 2 });
  const secret = await partyLinkSecret(cred.secret, id, 'personal');
  const view = { id, secret: await viewLinkSecret(secret, id) };
  const readUpdates = async () => {
    const results = await Promise.all([
      tracker.loadResponses(cred),
      tracker.loadParty(cred.id, { id, secret }),
      tracker.loadPartyView(cred.id, view),
    ]);
    assert.ok(results.every(({ data }) => !Object.hasOwn(data.d, 'updateNotice')));
    return results.map(({ data }) => data.updateNotice);
  };
  assert.equal((await tracker.saveUpdate(cred, 'The party starts at 18:00.')).status, 204);
  const latest = 'The party starts at 19:00.\nUse the side door.';
  const [update, publish] = await Promise.all([
    tracker.saveUpdate(cred, `  ${latest} `),
    tracker.publish(cred, { ...invite, d: { ...invite.d, title: 'New invitation title' } }),
  ]);
  assert.deepEqual([update.status, publish.status], [204, 200]);
  assert.deepEqual(await readUpdates(), [latest, latest, latest]);
  const publicRead = await tracker.loadEvent(cred.id);
  assert.equal(publicRead.data.d.title, 'New invitation title');
  assert.ok(!JSON.stringify(publicRead.data).includes(latest.split('\n')[0]));
  assert.ok(!Object.hasOwn((await tracker.publish(cred, invite)).data.d, 'updateNotice'));
  assert.equal((await tracker.saveUpdate(cred, null)).status, 204);
  assert.deepEqual(await readUpdates(), [undefined, undefined, undefined]);
});

const hash = (secret) => createHash('sha256').update(secret).digest('hex');
const linkSecret = (secret, id, purpose = 'personal') =>
  createHmac('sha256', secret).update(`petalpost:${purpose}:${id}`).digest('base64url');

test('the tracker prepares a preview for a party created before guest sharing', async () => {
  const { db, client } = await setup();
  const cred = host();
  const tracker = client();
  await tracker.publish(cred, { ...party, d: { ...party.d, mode: 'guestList' } });
  const id = newId();
  assert.equal((await tracker.addParty(cred, id, { name: 'Radu', defaultSeats: 2 })).status, 201);
  assert.equal((await tracker.changePartyLink(cred, id, 'regenerate')).status, 204);
  const { linkGeneration } = (await tracker.loadResponses(cred)).data.parties[0];
  const previousView = await partyLinkSecret(cred.secret, id, 'view', linkGeneration);
  await db.query('update parties set view_hash = $1 where id = $2', [hash(previousView), id]);

  const personal = await partyLinkSecret(cred.secret, id, 'personal', linkGeneration);
  const previewSecret = await viewLinkSecret(personal, id);
  const guest = client(newId());
  assert.equal((await guest.loadPartyView(cred.id, { id, secret: previewSecret })).status, 404);
  await tracker.loadResponses(cred);
  const preview = await guest.loadPartyView(cred.id, { id, secret: previewSecret });
  assert.deepEqual([preview.status, preview.data.name], [200, 'Radu']);
  const [row] = (await tracker.loadResponses(cred)).data.parties;
  assert.deepEqual([row.firstOpenedAt, row.lastOpenedAt], [null, null]);
});

test('renaming preserves the personal link and reply and deleting removes the party and reply', async () => {
  const { client } = await setup();
  const cred = host();
  const owner = client();
  await owner.publish(cred, { ...party, d: { ...party.d, mode: 'guestList' } });
  const id = newId();
  const guest = { id, secret: await partyLinkSecret(cred.secret, id, 'personal'), version: undefined };
  await owner.addParty(cred, id, { name: 'Familia Radu', defaultSeats: 2 });
  await owner.savePartyReply(cred.id, guest, { attending: true, partySize: 2, note: 'Fără nuci' });

  const refused = await owner.deleteParty({ ...cred, secret: guest.secret }, id);
  const renamed = await owner.renameParty(cred, id, 'Familia Dima');
  const updated = await owner.loadParty(cred.id, guest);
  const removed = await owner.deleteParty(cred, id);
  const gone = await owner.loadParty(cred.id, guest);
  const list = await owner.loadResponses(cred);
  assert.deepEqual(
    [
      refused.status,
      renamed.status,
      updated.data.name,
      updated.data.reply.note,
      removed.status,
      gone.status,
      list.data.parties,
    ],
    [403, 204, 'Familia Dima', 'Fără nuci', 204, 404, []],
  );
});

test('a passkey session reads the guest list but cannot create parties or change their links', async () => {
  const { client } = await setup();
  const cred = host();
  const owner = client();
  const other = client(newId());
  await owner.publish(cred, { ...party, d: { ...party.d, mode: 'guestList' } });
  const id = newId();
  assert.equal((await owner.addParty(cred, id, { name: 'Sam', defaultSeats: 2 })).status, 201);
  const key = authenticator();
  const registration = (await owner.passkeyChallenge(cred)).data;
  assert.equal((await owner.savePasskey(cred, key.register(registration.challenge))).status, 201);
  const challenge = (await other.signInChallenge()).data;
  const signedIn = await other.signIn(key.signIn(challenge.challenge));
  assert.equal(signedIn.status, 200);
  const tokenCred = { id: cred.id, secret: signedIn.data.token };
  const refused = await other.addParty(tokenCred, newId(), { name: 'Lee', defaultSeats: 3 });
  assert.equal((await other.changePartyLink(tokenCred, id, 'revoke')).status, 403);
  assert.equal((await other.changePartyLink(tokenCred, id, 'regenerate')).status, 403);
  const list = await other.loadResponses(tokenCred);
  assert.deepEqual(
    { refused: refused.status, read: list.status, names: list.data.parties.map(({ name }) => name) },
    { refused: 403, read: 200, names: ['Sam'] },
  );
});

for (const lang of ['en', 'ro']) {
  test(`in ${lang}, revoking a personal link keeps the party's reply and tracker totals`, async () => {
    const { client } = await setup();
    const cred = host();
    const tracker = client(newId(), lang);
    const guest = client(newId(), lang);
    await tracker.publish(cred, { ...party, d: { ...party.d, mode: 'guestList' } });
    const id = newId();
    await tracker.addParty(cred, id, { name: 'Familia Radu', defaultSeats: 3 });
    const personal = {
      id,
      secret: await partyLinkSecret(cred.secret, id, 'personal'),
    };
    const answer = { attending: true, partySize: 2, note: 'Fără nuci' };
    const saved = await guest.savePartyReply(cred.id, personal, answer);
    assert.equal(saved.status, 201);
    personal.version = saved.data.version;
    const before = (await tracker.loadResponses(cred)).data;
    assert.equal((await guest.changePartyLink({ id: cred.id, secret: personal.secret }, id, 'revoke')).status, 403);
    assert.equal((await tracker.changePartyLink(cred, id, 'revoke')).status, 204);
    const unavailable =
      lang === 'en'
        ? 'This link no longer works. Ask the host for a new one.'
        : 'Acest link nu mai funcționează. Cere-i gazdei un link nou.';
    for (const result of [
      await guest.loadParty(cred.id, personal),
      await guest.savePartyReply(cred.id, personal, answer),
      await guest.withdrawPartyReply(cred.id, personal),
    ]) {
      assert.equal(result.status, 404);
      assert.deepEqual(result.data, { error: unavailable });
    }
    const after = (await tracker.loadResponses(cred)).data;
    assert.equal(after.parties[0].revoked, true);
    assert.deepEqual(after.parties[0].reply, before.parties[0].reply);
    assert.deepEqual(after.totals, before.totals);
  });

  test(`in ${lang}, a regenerated link can edit an earlier reply or start a new reply`, async () => {
    const { client } = await setup();
    const cred = host();
    const tracker = client(newId(), lang);
    const guest = client(newId(), lang);
    await tracker.publish(cred, { ...party, d: { ...party.d, mode: 'guestList' } });
    const answer = { attending: true, partySize: 2, note: 'Fără nuci' };
    for (const hadReply of [true, false]) {
      const id = newId();
      await tracker.addParty(cred, id, { name: hadReply ? 'Familia Radu' : 'Familia Dima', defaultSeats: 3 });
      const old = { id, secret: await partyLinkSecret(cred.secret, id, 'personal') };
      if (hadReply) assert.equal((await guest.savePartyReply(cred.id, old, answer)).status, 201);
      const before = (await tracker.loadResponses(cred)).data;
      if (hadReply) assert.equal((await tracker.changePartyLink(cred, id, 'revoke')).status, 204);
      assert.equal((await tracker.changePartyLink(cred, id, 'regenerate')).status, 204);
      const after = (await tracker.loadResponses(cred)).data;
      const entry = after.parties.find((entry) => entry.id === id);
      assert.equal(entry.revoked, false);
      assert.deepEqual(after.totals, before.totals);
      assert.deepEqual(entry.reply, before.parties.find((entry) => entry.id === id).reply);
      assert.equal((await tracker.changePartyLink(cred, id, 'regenerate')).status, 409);
      assert.equal((await tracker.changePartyLink(cred, id, 'revoke')).status, 409);
      const secret = await partyLinkSecret(cred.secret, id, 'personal', entry.linkGeneration);
      assert.notEqual(secret, old.secret);
      const newLink = { id, secret };
      const earlier = await guest.loadParty(cred.id, newLink);
      assert.equal(earlier.status, 200);
      assert.deepEqual(earlier.data.reply, hadReply ? { ...answer, version: 2 } : null);
      assert.equal((await guest.loadParty(cred.id, old)).status, 404);
      newLink.version = earlier.data.reply?.version;
      const changed = { attending: false, partySize: 0, note: 'Noi planuri' };
      assert.equal((await guest.savePartyReply(cred.id, newLink, changed)).status, hadReply ? 200 : 201);
    }
  });

  test(`in ${lang}, addParties keeps an explicit party language and defaults omitted language to the invitation language`, async () => {
    const { client } = await setup();
    const cred = host();
    const tracker = client(newId(), lang);
    const other = lang === 'en' ? 'ro' : 'en';
    await tracker.publish(cred, { ...party, d: { ...party.d, mode: 'guestList' } });
    assert.equal((await tracker.addParties(cred, [{ id: newId(), name: 'Default party' }], 2)).added, 1);
    assert.equal(
      (
        await tracker.addParties(
          cred,
          [
            { id: newId(), name: 'Abroad party' },
            { id: newId(), name: 'Second abroad party' },
          ],
          3,
          other,
        )
      ).added,
      2,
    );
    const list = await tracker.loadResponses(cred);
    assert.deepEqual(list.data.parties.map(({ name, lang: partyLang }) => [name, partyLang]).sort(), [
      ['Abroad party', other],
      ['Default party', lang],
      ['Second abroad party', other],
    ]);
  });

  test(`in ${lang}, each party can manage only its own reply through its personal link`, async () => {
    const { client, raw } = await setup();
    const cred = host();
    const tracker = client(newId(), lang);
    await tracker.publish(cred, { ...party, d: { ...party.d, mode: 'guestList' } });
    const root = `/api/events/${cred.id}/parties`;
    const request = async (path, secret, method = 'GET', body = undefined) => {
      const response = await raw(path, {
        method,
        headers: { authorization: `Bearer ${secret}`, 'accept-language': lang },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const text = await response.text();
      for (const value of credentials) assert.ok(!text.includes(value) && !text.includes(hash(value)));
      return { status: response.status, data: text ? JSON.parse(text) : null };
    };
    const guestFor = (id) => ({
      id,
      secret: linkSecret(cred.secret, id, 'personal'),
      view: linkSecret(cred.secret, id, 'view'),
    });
    const a = guestFor(newId());
    const b = guestFor(newId());
    const credentials = [cred.secret, a.secret, a.view, b.secret, b.view];
    for (const { guest, name } of [
      { guest: a, name: 'Familia Radu' },
      { guest: b, name: 'Familia Dima' },
    ]) {
      const result = await request(`${root}/${guest.id}`, cred.secret, 'PUT', {
        name,
        defaultSeats: 3,
        lang,
      });
      assert.equal(result.status, 201);
    }
    const path = `${root}/${a.id}`;
    const personal = await request(path, a.secret);
    assert.deepEqual(
      [personal.status, personal.data.name, personal.data.defaultSeats, personal.data.reply],
      [200, 'Familia Radu', 3, null],
    );
    const refused = await request(path, b.secret);
    assert.deepEqual(refused, {
      status: 404,
      data: {
        error:
          lang === 'en'
            ? 'This link no longer works. Ask the host for a new one.'
            : 'Acest link nu mai funcționează. Cere-i gazdei un link nou.',
      },
    });
    const answer = { attending: true, partySize: 2, note: 'Fără nuci' };
    assert.equal((await request(path, b.secret, 'PATCH', answer)).status, 404);
    assert.equal((await request(path, a.view)).status, 404);
    const wrongInvitation = `/api/events/${newId()}/parties/${a.id}`;
    assert.equal((await request(wrongInvitation, a.secret)).status, 404);
    const attempts = await Promise.all([
      request(path, a.secret, 'PATCH', answer),
      request(path, a.secret, 'PATCH', answer),
    ]);
    assert.deepEqual(attempts.map(({ status }) => status).sort(), [201, 409]);
    const saved = (await request(path, a.secret)).data.reply;
    const changed = await request(path, a.secret, 'PATCH', {
      attending: false,
      partySize: 0,
      note: 'Noi planuri',
      version: saved.version,
    });
    assert.equal(changed.status, 200);
    const list = await request(`/api/events/${cred.id}/responses`, cred.secret);
    assert.deepEqual(
      list.data.parties.map(({ name, reply }) => [name, reply?.attending, reply?.partySize, reply?.note]),
      [
        ['Familia Radu', false, 0, 'Noi planuri'],
        ['Familia Dima', undefined, undefined, undefined],
      ],
    );
    assert.equal((await request(path, a.secret, 'DELETE', { version: changed.data.version })).status, 204);
    assert.equal((await request(path, a.secret)).data.reply, null);
    assert.equal((await request(path, a.secret, 'PATCH', answer)).status, 201);
    assert.equal((await request(path, a.secret, 'DELETE', { version: changed.data.version })).status, 409);
  });

  test(`in ${lang}, loading a personal link records first and last opened times while a view link records none`, async () => {
    const { client, raw } = await setup();
    const cred = host();
    const tracker = client(newId(), lang);
    await tracker.publish(cred, { ...party, d: { ...party.d, mode: 'guestList' } });
    const id = newId();
    assert.equal((await tracker.addParty(cred, id, { name: 'Familia Radu', defaultSeats: 3 })).status, 201);
    const personalSecret = createHmac('sha256', cred.secret).update(`petalpost:personal:${id}`).digest('base64url');
    const viewSecret = await viewLinkSecret(personalSecret, id);

    const link = viewLink(`https://petalpost.example/e/${cred.id}`, id, viewSecret);
    assert.deepEqual(readCredential(link.slice(link.indexOf('#')), 'v='), { id, secret: viewSecret });

    const before = (await tracker.loadResponses(cred)).data.parties[0];
    assert.deepEqual([before.firstOpenedAt, before.lastOpenedAt, partyStatus(before)], [null, null, 'notOpened']);

    const viewPath = `/api/events/${cred.id}/parties/${id}/view`;
    const viewBad = await raw(viewPath, {
      headers: { authorization: `Bearer ${personalSecret}`, 'accept-language': lang },
    });
    assert.equal(viewBad.status, 404);

    const view = await client(newId(), lang).loadPartyView(cred.id, { id, secret: viewSecret });
    assert.deepEqual(
      [view.status, Object.keys(view.data).sort(), view.data.name],
      [200, ['d', 'name', 't'], 'Familia Radu'],
    );

    const afterView = (await tracker.loadResponses(cred)).data.parties[0];
    assert.deepEqual(
      [afterView.firstOpenedAt, afterView.lastOpenedAt, partyStatus(afterView)],
      [null, null, 'notOpened'],
    );

    const guestClient = client(newId(), lang);
    assert.equal((await guestClient.loadParty(cred.id, { id, secret: personalSecret })).status, 200);
    const first = (await tracker.loadResponses(cred)).data.parties[0];
    assert.ok(first.firstOpenedAt && first.lastOpenedAt);
    assert.equal(first.firstOpenedAt, first.lastOpenedAt);
    assert.equal(partyStatus(first), 'opened');

    await new Promise((resolve) => setTimeout(resolve, 15));
    assert.equal((await guestClient.loadParty(cred.id, { id, secret: personalSecret })).status, 200);
    const second = (await tracker.loadResponses(cred)).data.parties[0];
    assert.equal(second.firstOpenedAt, first.firstOpenedAt);
    assert.ok(new Date(second.lastOpenedAt).getTime() >= new Date(first.lastOpenedAt).getTime());
    assert.ok(second.lastOpenedAt > first.lastOpenedAt);

    assert.equal(
      (
        await guestClient.savePartyReply(
          cred.id,
          { id, secret: personalSecret },
          {
            attending: true,
            partySize: 2,
            note: '',
          },
        )
      ).status,
      201,
    );
    const replied = (await tracker.loadResponses(cred)).data.parties[0];
    assert.equal(partyStatus(replied), 'replied');
    const viewAfterReply = await client(newId(), lang).loadPartyView(cred.id, { id, secret: viewSecret });
    assert.deepEqual([viewAfterReply.status, 'reply' in viewAfterReply.data], [200, false]);
  });

  test(`in ${lang}, a party can reply above default seats up to 20, totals count them, and 21 is refused`, async () => {
    const { client } = await setup();
    const cred = host();
    const tracker = client(newId(), lang);
    const guestClient = client(newId(), lang);
    await tracker.publish(cred, { ...party, d: { ...party.d, mode: 'guestList' } });
    const partyId = newId();
    assert.equal((await tracker.addParty(cred, partyId, { name: 'Familia Pop', defaultSeats: 2 })).status, 201);
    const pCred = { id: partyId, secret: linkSecret(cred.secret, partyId) };

    const overCap = await guestClient.savePartyReply(cred.id, pCred, { attending: true, partySize: 21, note: '' });
    assert.equal(overCap.status, 400);
    assert.match(overCap.message, /20/);

    const overDefault = await guestClient.savePartyReply(cred.id, pCred, {
      attending: true,
      partySize: 5,
      note: 'Plus kids',
    });
    assert.equal(overDefault.status, 201);

    const atCap = await guestClient.savePartyReply(
      cred.id,
      { ...pCred, version: overDefault.data.version },
      { attending: true, partySize: 20, note: 'Plus kids' },
    );
    assert.equal(atCap.status, 200);

    const list = await tracker.loadResponses(cred);
    assert.deepEqual(partyTotals(list.data.parties), { accepted: 20, declined: 0, pending: 0 });
  });

  test(`in ${lang}, the host can edit a party's reply seats at any time and the guest sees the change`, async () => {
    const { client } = await setup();
    const cred = host();
    const tracker = client(newId(), lang);
    const guestClient = client(newId(), lang);
    await tracker.publish(cred, { ...party, d: { ...party.d, mode: 'guestList' } });
    const phoneParty = newId();
    const repliedParty = newId();
    assert.equal((await tracker.addParty(cred, phoneParty, { name: 'Familia Ionescu', defaultSeats: 2 })).status, 201);
    assert.equal((await tracker.addParty(cred, repliedParty, { name: 'Familia Marin', defaultSeats: 3 })).status, 201);
    const personalCred = (id) => ({ id, secret: linkSecret(cred.secret, id) });
    const phoneCred = personalCred(phoneParty);
    const repliedCred = personalCred(repliedParty);

    // Host sets seats for a party that has not replied yet.
    const firstEdit = await tracker.setPartySeats(cred, phoneParty, { partySize: 4 });
    assert.equal(firstEdit.status, 200);
    assert.deepEqual((await guestClient.loadParty(cred.id, phoneCred)).data.reply, {
      attending: true,
      partySize: 4,
      note: '',
      version: firstEdit.data.version,
    });

    // Guest replies with a note, then host edits seats and preserves the note.
    const guestReply = await guestClient.savePartyReply(cred.id, repliedCred, {
      attending: true,
      partySize: 2,
      note: 'Fără gluten',
    });
    assert.equal(guestReply.status, 201);
    const secondEdit = await tracker.setPartySeats(cred, repliedParty, {
      partySize: 6,
      version: guestReply.data.version,
    });
    assert.equal(secondEdit.status, 200);
    assert.deepEqual((await guestClient.loadParty(cred.id, repliedCred)).data.reply, {
      attending: true,
      partySize: 6,
      note: 'Fără gluten',
      version: secondEdit.data.version,
    });

    // Totals count both parties' edited seats.
    assert.deepEqual(partyTotals((await tracker.loadResponses(cred)).data.parties), {
      accepted: 10,
      declined: 0,
      pending: 0,
    });

    // Stale version gets 409 with the current reply.
    const stale = await tracker.setPartySeats(cred, repliedParty, {
      partySize: 5,
      version: guestReply.data.version,
    });
    assert.equal(stale.status, 409);
    assert.equal(stale.data.reply.partySize, 6);

    // Host can set seats to 0 (declined), keeping the note.
    const declined = await tracker.setPartySeats(cred, repliedParty, {
      partySize: 0,
      version: secondEdit.data.version,
    });
    assert.equal(declined.status, 200);
    assert.deepEqual((await guestClient.loadParty(cred.id, repliedCred)).data.reply, {
      attending: false,
      partySize: 0,
      note: 'Fără gluten',
      version: declined.data.version,
    });
    assert.deepEqual(partyTotals((await tracker.loadResponses(cred)).data.parties), {
      accepted: 4,
      declined: 1,
      pending: 0,
    });

    // Invalid counts, missing party and non-host credentials are refused.
    const overCap = await tracker.setPartySeats(cred, phoneParty, { partySize: 21, version: firstEdit.data.version });
    const negative = await tracker.setPartySeats(cred, phoneParty, { partySize: -1, version: firstEdit.data.version });
    const missing = await tracker.setPartySeats(cred, newId(), { partySize: 2 });
    const forbidden = await tracker.setPartySeats({ id: cred.id, secret: phoneCred.secret }, phoneParty, {
      partySize: 2,
      version: firstEdit.data.version,
    });
    assert.deepEqual([overCap.status, negative.status, missing.status, forbidden.status], [400, 400, 404, 403]);
    assert.match(overCap.message, /20/);
  });
}

test('missing-party host actions return partyMissing 404 and open-mode invitations refuse host party mutations with 403', async () => {
  const { tracker, cred } = await guestListEvent({ parties: ['Sam'] });
  const missingId = newId();
  const missingMsg = 'The party is no longer on the guest list.';
  for (const res of [
    await tracker.changePartyLink(cred, missingId, 'regenerate'),
    await tracker.saveHostPartyReply(cred, missingId, { attending: true, partySize: 2, note: '' }),
    await tracker.assignParty(cred, missingId, null),
    await tracker.renameParty(cred, missingId, 'New name'),
  ]) {
    assert.deepEqual([res.status, res.message], [404, missingMsg]);
  }

  const { client } = await setup();
  const open = host();
  const owner = client();
  await owner.publish(open, party);
  for (const res of [
    await owner.changePartyLink(open, missingId, 'revoke'),
    await owner.renameParty(open, missingId, 'New name'),
    await owner.deleteParty(open, missingId),
  ]) {
    assert.equal(res.status, 403);
  }
});

test('editor republish preserves mode, deadline, updateNotice and seatingPublished together', async () => {
  const { tracker, cred, invite } = await guestListEvent({ parties: ['Sam'] });
  assert.equal((await tracker.setDeadline(cred, '2026-08-01')).status, 200);
  assert.equal((await tracker.saveUpdate(cred, 'Meet at gate B.')).status, 204);
  assert.equal((await tracker.setSeatingPublished(cred, true)).status, 200);

  const republished = await tracker.publish(cred, {
    ...invite,
    d: { ...invite.d, mode: 'open', title: 'Edited title' },
  });
  assert.equal(republished.status, 200);
  const { data } = await tracker.loadResponses(cred);
  assert.deepEqual(
    {
      title: data.d.title,
      mode: data.d.mode,
      deadline: data.d.deadline,
      seatingPublished: data.d.seatingPublished,
      updateNotice: data.updateNotice,
    },
    {
      title: 'Edited title',
      mode: 'guestList',
      deadline: '2026-08-01',
      seatingPublished: true,
      updateNotice: 'Meet at gate B.',
    },
  );
});

test('tracker snapshot reads succeed alongside concurrent party edits and still backfill legacy view hashes', async () => {
  const { db, tracker, guests, cred, parties } = await guestListEvent({ parties: ['Radu', 'Dima'] });
  const [radu, dima] = parties;
  const legacyView = await partyLinkSecret(cred.secret, radu.id, 'view');
  await db.query('update parties set view_hash = $1 where id = $2', [hash(legacyView), radu.id]);

  const [readResult, editResult] = await Promise.all([
    tracker.loadResponses(cred),
    tracker.renameParty(cred, dima.id, 'Familia Dima'),
  ]);
  assert.deepEqual([readResult.status, editResult.status], [200, 204]);
  const preview = await guests.loadPartyView(cred.id, radu.view);
  assert.deepEqual([preview.status, preview.data.name], [200, 'Radu']);
});
