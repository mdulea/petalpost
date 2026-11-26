// Fails when the schema migrations break a database. Checks: all migrations apply to an empty database, and a second
// run applies nothing; the guest-list migration applies to a database that holds the earlier schema with an
// invitation and a reply, which keep their data and their management and reply edit link reads; deleting an
// invitation through the API deletes its parties, their replies, its open replies, its tables, its passkeys, its
// passkey challenges and its access tokens, and leaves another invitation's rows; deleting a table unassigns its
// parties; an open reply allows up to 10 people and a party reply up to 20; a reply has an edit secret hash exactly
// when it has no party.
// Each test runs in its own in-memory PGlite database.
// Run: pnpm exec node tests/check-migrations.js
import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { getTemplate } from '../public/js/templates.js';
import { makeInviteData } from '../public/js/invite.js';
import { createClient, newId, newSecret } from '../public/js/rsvp.js';
import { createApi } from '../server/api.js';
import { migrate } from '../server/migrate.js';

const MIGRATIONS = new URL('../server/migrations/', import.meta.url);
const GUEST_LISTS = '005_guest_lists.sql';

// A database with the migrations before the guest-list one applied, as production holds before this change.
async function earlierSchema(t) {
  const dir = await mkdtemp(join(tmpdir(), 'petalpost-migrations-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const name of await readdir(MIGRATIONS)) {
    if (name < GUEST_LISTS) await copyFile(new URL(name, MIGRATIONS), join(dir, name));
  }
  const db = new PGlite();
  t.after(() => db.close());
  await migrate(db, pathToFileURL(`${dir}/`));
  return db;
}

async function migrated(t) {
  const db = new PGlite();
  t.after(() => db.close());
  await migrate(db);
  return db;
}

const client = (db) =>
  createClient((path, init) => createApi(db)(new Request(new URL(path, 'http://petalpost.test'), init)));
const record = { t: 'wedding', d: makeInviteData(getTemplate('wedding'), { title: 'Ana and Lee' }) };
const reply = { name: 'Sam', attending: true, partySize: 3, note: 'No nuts' };

async function publish(db) {
  const cred = { id: newId(), secret: newSecret(), version: null };
  assert.equal((await client(db).publish(cred, record)).status, 201);
  return cred;
}

const insertParty = (db, eventId, id, tableId = null) =>
  db.query(
    `insert into parties (id, event_id, name, lang, default_seats, secret_hash, view_hash, table_id)
     values ($1, $2, 'Familia Popescu', 'ro', 4, 'personal', 'view', $3)`,
    [id, eventId, tableId],
  );
const insertPartyReply = (db, eventId, partyId, partySize) =>
  db.query(
    `insert into responses (id, event_id, party_id, name, attending, party_size) values ($1, $2, $3, 'Ana', true, $4)`,
    [newId(), eventId, partyId, partySize],
  );
const insertOpenReply = (db, eventId, partySize) =>
  db.query(
    `insert into responses (id, event_id, secret_hash, name, attending, party_size) values ($1, $2, 'edit', 'Lee', true, $3)`,
    [newId(), eventId, partySize],
  );

test('all migrations apply to an empty database, and a second run applies nothing', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  const names = (await readdir(MIGRATIONS)).filter((name) => name.endsWith('.sql')).sort();
  assert.deepEqual({ first: await migrate(db), second: await migrate(db) }, { first: names, second: [] });
});

test('the guest-list migration keeps an earlier invitation and reply and their reads', async (t) => {
  const db = await earlierSchema(t);
  const cred = await publish(db);
  const edit = { id: newId(), secret: newSecret(), version: null };
  assert.equal((await client(db).saveReply(cred.id, edit, reply)).status, 201);
  const reads = async () => ({
    event: (await client(db).loadEvent(cred.id)).data,
    responses: (await client(db).loadResponses(cred)).data,
    reply: (await client(db).loadReply(cred.id, edit)).data,
  });
  const before = await reads();
  assert.deepEqual(await migrate(db), [GUEST_LISTS]);
  assert.deepEqual(await reads(), before);
  assert.deepEqual(before.reply, { ...reply, version: 1 });
});

test('deleting an invitation deletes its guest-list rows and keeps those of another invitation', async (t) => {
  const db = await migrated(t);
  const counts = async (eventId) =>
    (
      await db.query(
        `select (select count(*)::int from parties where event_id = $1) as parties,
                (select count(*)::int from responses where event_id = $1) as replies,
                (select count(*)::int from seating_tables where event_id = $1) as tables,
                (select count(*)::int from passkeys where event_id = $1) as passkeys,
                (select count(*)::int from passkey_challenges where event_id = $1) as challenges,
                (select count(*)::int from access_tokens where event_id = $1) as tokens`,
        [eventId],
      )
    ).rows[0];
  const fill = async (eventId) => {
    const tableId = newId();
    const partyId = newId();
    await db.query(`insert into seating_tables (id, event_id, name, capacity) values ($1, $2, 'Table 1', 8)`, [
      tableId,
      eventId,
    ]);
    await insertParty(db, eventId, partyId, tableId);
    await insertPartyReply(db, eventId, partyId, 4);
    await insertOpenReply(db, eventId, 2);
    await db.query(`insert into passkeys (id, event_id, public_key) values ($1, $2, 'key')`, [newId(), eventId]);
    await db.query(
      `insert into passkey_challenges (challenge, event_id, expires_at) values ($1, $2, now() + interval '5 minutes')`,
      [newId(), eventId],
    );
    await db.query(
      `insert into access_tokens (token_hash, event_id, expires_at) values ($1, $2, now() + interval '1 hour')`,
      [newId(), eventId],
    );
  };
  const deleted = await publish(db);
  const kept = await publish(db);
  await fill(deleted.id);
  await fill(kept.id);
  const filled = { parties: 1, replies: 2, tables: 1, passkeys: 1, challenges: 1, tokens: 1 };
  assert.deepEqual(await counts(deleted.id), filled);
  assert.equal((await client(db).deleteEvent(deleted)).status, 204);
  assert.deepEqual(
    { deleted: await counts(deleted.id), kept: await counts(kept.id) },
    { deleted: { parties: 0, replies: 0, tables: 0, passkeys: 0, challenges: 0, tokens: 0 }, kept: filled },
  );
});

test('deleting a table unassigns its parties', async (t) => {
  const db = await migrated(t);
  const { id: eventId } = await publish(db);
  const tableId = newId();
  const partyId = newId();
  await db.query(`insert into seating_tables (id, event_id, name, capacity) values ($1, $2, '7', 10)`, [
    tableId,
    eventId,
  ]);
  await insertParty(db, eventId, partyId, tableId);
  await db.query('delete from seating_tables where id = $1', [tableId]);
  assert.deepEqual((await db.query('select table_id from parties where id = $1', [partyId])).rows, [
    { table_id: null },
  ]);
});

test('an open reply allows up to 10 people and a party reply up to 20', async (t) => {
  const db = await migrated(t);
  const { id: eventId } = await publish(db);
  const [a, b] = [newId(), newId()];
  await insertParty(db, eventId, a);
  await insertParty(db, eventId, b);
  await insertOpenReply(db, eventId, 10);
  await assert.rejects(insertOpenReply(db, eventId, 11), /responses_party_size/);
  await insertPartyReply(db, eventId, a, 20);
  await assert.rejects(insertPartyReply(db, eventId, b, 21), /responses_party_size/);
});

test('a reply has an edit secret hash exactly when it has no party', async (t) => {
  const db = await migrated(t);
  const { id: eventId } = await publish(db);
  const partyId = newId();
  await insertParty(db, eventId, partyId);
  const insert = (party, secretHash) =>
    db.query(
      `insert into responses (id, event_id, party_id, secret_hash, name, attending, party_size)
       values ($1, $2, $3, $4, 'Ana', false, 0)`,
      [newId(), eventId, party, secretHash],
    );
  await assert.rejects(insert(partyId, 'edit'), /responses_link/);
  await assert.rejects(insert(null, null), /responses_link/);
});
