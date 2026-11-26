// Every route uses /api/events/{eventId}/parties/{id}. A PUT with the management secret adds a party from
// {name, defaultSeats, lang}. GET uses the personal secret and returns {t, d, name, defaultSeats, reply}.
// PATCH with the personal secret saves {attending, partySize, note?, version?, lang?} and returns {version}.
// DELETE with the same secret and {version} withdraws the reply. A stale write gets 409 and the current reply.
import { normalizeLang } from '../../public/js/i18n.js';
import { modeOf } from '../../public/js/invite.js';
import { makeReply, newId, PARTY_LIMITS, partyLinkSecret } from '../../public/js/rsvp.js';
import { addCount, bearer, hash, json, matches, ownedEvent, readBody, Refusal } from './shared.js';

export const routes = [
  {
    pattern: /^\/api\/events\/([^/]+)\/parties\/([^/]+)$/,
    methods: { PUT: addParty, GET: getParty, PATCH: saveReply, DELETE: withdrawReply },
  },
];

async function addParty({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const { name, defaultSeats, lang } = await readBody(request);
  const trimmed = typeof name === 'string' ? name.trim() : '';
  const length = [...trimmed].length;
  if (
    length < 1 ||
    length > PARTY_LIMITS.name ||
    /\p{Cc}/u.test(trimmed) ||
    !Number.isInteger(defaultSeats) ||
    defaultSeats < 1 ||
    defaultSeats > PARTY_LIMITS.seats
  )
    throw new Refusal(400, 'party');

  return db.transaction(async (tx) => {
    const event = await ownedEvent(tx, eventId, secret);
    if (modeOf(event.d) !== 'guestList') throw new Refusal(403, 'partyMode');
    const existing = (await tx.query('select event_id from parties where id = $1', [id])).rows[0];
    if (existing?.event_id === eventId) return json(200, { id });
    const { count } = (await tx.query('select count(*)::int as count from parties where event_id = $1', [eventId]))
      .rows[0];
    if (count >= PARTY_LIMITS.count) throw new Refusal(429, 'partyLimit');
    const personal = await partyLinkSecret(secret, id, 'personal');
    const view = await partyLinkSecret(secret, id, 'view');
    const { rows } = await tx.query(
      `insert into parties (id, event_id, name, lang, default_seats, secret_hash, view_hash)
       values ($1, $2, $3, $4, $5, $6, $7) on conflict (id) do nothing returning id`,
      [id, eventId, trimmed, normalizeLang(lang), defaultSeats, hash(personal), hash(view)],
    );
    if (!rows.length) throw new Refusal(409, 'partyId');
    return json(201, { id });
  });
}

// Reads a basic party reply from an explicitly selected row. No reply is represented by null.
const replyOf = (row) =>
  row?.reply_version == null
    ? null
    : {
        attending: row.attending,
        partySize: row.party_size,
        note: row.note,
        version: row.reply_version,
      };

const replyColumns = 'r.attending, r.party_size, r.note, r.version as reply_version';

// Reads only the authenticated host's parties, joined to each party's current reply.
export async function listParties(db, eventId) {
  const { rows } = await db.query(
    `select p.id, p.name, p.lang, p.default_seats, ${replyColumns} from parties p
     left join responses r on r.party_id = p.id where p.event_id = $1 order by p.created_at, p.id`,
    [eventId],
  );
  return rows.map((p) => ({ id: p.id, name: p.name, lang: p.lang, defaultSeats: p.default_seats, reply: replyOf(p) }));
}

function checkPersonalLink(party, secret) {
  if (!party || party.revoked || !matches(secret, party.secret_hash)) throw new Refusal(404, 'personalLink');
}

async function getParty({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const {
    rows: [party],
  } = await db.query(
    `select p.name, p.default_seats, p.secret_hash, p.revoked, e.t, e.d, ${replyColumns}
     from parties p join events e on e.id = p.event_id left join responses r on r.party_id = p.id
     where p.id = $1 and p.event_id = $2`,
    [id, eventId],
  );
  checkPersonalLink(party, secret);
  return json(200, {
    t: party.t,
    d: party.d,
    name: party.name,
    defaultSeats: party.default_seats,
    reply: replyOf(party),
  });
}

// Serializes reply changes through the party row. A fresh read after locking sees the latest reply.
async function ownedPartyReply(tx, eventId, id, secret) {
  // The event is the parent of both rows. Lock it first to keep the order of a concurrent invitation deletion.
  await tx.query('select id from events where id = $1 for key share', [eventId]);
  const {
    rows: [party],
  } = await tx.query(
    'select name, default_seats, secret_hash, revoked, version from parties where id = $1 and event_id = $2 for update',
    [id, eventId],
  );
  checkPersonalLink(party, secret);
  const {
    rows: [reply],
  } = await tx.query(`select ${replyColumns} from responses r where party_id = $1`, [id]);
  return { ...party, reply: replyOf(reply) };
}

async function saveReply({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const body = await readBody(request);
  return db.transaction(async (tx) => {
    const party = await ownedPartyReply(tx, eventId, id, secret);
    const { reply } = makeReply({ ...body, name: party.name }, party.default_seats);
    if (!reply) throw new Refusal(400, 'partyReply');
    if (body.version !== party.reply?.version) throw new Refusal(409, 'replyChanged', { reply: party.reply });
    // The party version advances across withdrawals, so a stale form cannot change a replacement reply.
    const version = party.version + 1;
    await tx.query(
      `insert into responses (id, event_id, party_id, name, attending, party_size, note, version)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (party_id) do update set attending = excluded.attending, party_size = excluded.party_size,
       note = excluded.note, version = excluded.version, updated_at = now()`,
      [newId(), eventId, id, reply.name, reply.attending, reply.partySize, reply.note, version],
    );
    await tx.query('update parties set version = $2 where id = $1', [id, version]);
    if (!party.reply) await addCount(tx, 'reply_submit', normalizeLang(body.lang));
    return json(party.reply ? 200 : 201, { version });
  });
}

async function withdrawReply({ db, request, ids: [eventId, id] }) {
  const secret = bearer(request);
  const { version } = await readBody(request);
  if (version === undefined) throw new Refusal(400, 'version');
  return db.transaction(async (tx) => {
    const { reply } = await ownedPartyReply(tx, eventId, id, secret);
    if (reply) {
      if (version !== reply.version) throw new Refusal(409, 'replyChanged', { reply });
      await tx.query('delete from responses where party_id = $1', [id]);
    }
    return json(204, null);
  });
}
