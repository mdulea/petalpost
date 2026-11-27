// The shared setup of the API checks: server/api.js over a migrated in-memory PGlite database, the client the
// browser uses, and a published invitation. A check file imports what it needs, so a new route module's check file
// starts from the same setup.
// setup(db?, options?) gives {db, raw, client} over db, or else over one database that every caller in the process
// shares and that closes after the file's last test. Every id is random, and each setup call gets its own client
// IP, so tests on the shared database stay independent. client(ip?, lang?) talks to the API the way the browser
// does; raw(path, init) sends a hand-made request for input that the client never produces. options go to createApi.
import { after } from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { createClient } from '../public/js/api-client.js';
import { makeInviteData } from '../public/js/invite.js';
import { newId, newSecret, partyLinkSecret, viewLinkSecret } from '../public/js/rsvp.js';
import { getTemplate } from '../public/js/templates.js';
import { createApi } from '../server/api.js';
import { migrate } from '../server/migrate.js';

let shared;
after(async () => (await shared)?.close());

// A migrated in-memory database of its own; the caller closes it.
export async function openDatabase() {
  const db = new PGlite();
  await migrate(db);
  return db;
}

export async function setup(db, options) {
  db ??= await (shared ??= openDatabase());
  const api = createApi(db, options);
  const ownIp = newId();
  const raw = (path, init = {}) => api(new Request(new URL(path, 'http://petalpost.test'), init));
  const client = (ip = ownIp, lang = 'en') =>
    createClient((path, init = {}) => raw(path, { ...init, headers: { ...init.headers, 'x-real-ip': ip } }), {
      lang,
    });
  return { db, raw, client };
}

// Fresh credentials for a host's invitation and for a guest's reply.
export const host = () => ({ id: newId(), secret: newSecret(), version: null });
export const guest = () => ({ id: newId(), secret: newSecret(), version: null });

export const party = {
  t: 'birthday',
  d: makeInviteData(getTemplate('birthday'), { title: 'Zoë turns 7', message: 'Café, a piñata and 🎂', photoY: 20 }),
};

// The party invitation published on the shared database; a separate browser, without the management secret, plays
// the guests.
export async function publishedEvent() {
  const { db, client, raw } = await setup();
  const cred = host();
  await client().publish(cred, party);
  return { db, client, raw, cred, guests: client(newId()) };
}

// Publishes a guest-list invitation and adds any requested parties, returning their personal and view credentials.
export async function guestListEvent({
  db = undefined,
  options = undefined,
  lang = 'en',
  template = 'birthday',
  overrides = {},
  parties = [],
} = {}) {
  const { db: activeDb, client, raw } = await setup(db, options);
  const tracker = client(newId(), lang);
  const guests = client(newId(), lang);
  const cred = host();
  const invite = {
    t: template,
    d: makeInviteData(
      getTemplate(template, lang),
      { title: 'Zoë turns 7', message: 'Café, a piñata and 🎂', mode: 'guestList', ...overrides },
      lang,
    ),
  };
  const created = await tracker.publish(cred, invite);
  if (created.ok) cred.version = created.data.version;
  const added = [];
  for (const entry of parties) {
    const spec = typeof entry === 'string' ? { name: entry, defaultSeats: 3 } : { defaultSeats: 3, ...entry };
    const id = newId();
    await tracker.addParty(cred, id, spec);
    const secret = await partyLinkSecret(cred.secret, id, 'personal');
    added.push({
      id,
      name: spec.name,
      personal: { id, secret, version: undefined },
      view: { id, secret: await viewLinkSecret(secret, id) },
    });
  }
  return { db: activeDb, client, raw, tracker, guests, cred, invite, parties: added };
}
