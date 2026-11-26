// The request helpers that every route module of server/api.js shares: refusals, JSON responses, secrets, bodies,
// the owned event lookup and the action counts.
//
// action_counts holds the totals of a fixed set of actions per UTC day and page language, and nothing else. addCount
// runs inside the transaction that stores what it counts, so a refused or rolled-back request counts nothing.
import { createHash, timingSafeEqual } from 'node:crypto';
import { SECRET_PATTERN } from '../../public/js/rsvp.js';

const MAX_BODY = 8 * 1024;

// A thrown Refusal becomes its error response, and rolls back the transaction it leaves. code names the message in
// apiMessages of public/js/i18n.js, and extra joins the error body.
export class Refusal extends Error {
  constructor(status, code, extra = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const json = (status, body) =>
  new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export const hash = (text) => createHash('sha256').update(text).digest('hex');
export const matches = (secret, secretHash) => timingSafeEqual(Buffer.from(hash(secret)), Buffer.from(secretHash));
const isVersion = (v) => Number.isInteger(v) && v > 0;
export const today = "(now() at time zone 'utc')::date";

// Adds 1 to today's count of the action in lang, which is en or ro.
export async function addCount(tx, action, lang) {
  await tx.query(
    `insert into action_counts (day, action, lang, count) values (${today}, $1, $2, 1)
     on conflict (day, action, lang) do update set count = action_counts.count + 1`,
    [action, lang],
  );
}

// The Bearer secret, or a 401 Refusal when it is missing or malformed.
export function bearer(request) {
  const secret = (request.headers.get('authorization') || '').match(/^Bearer (\S+)$/)?.[1];
  if (!secret || !SECRET_PATTERN.test(secret)) throw new Refusal(401, 'unauthorized');
  return secret;
}

// The JSON object body with a valid optional version, or a 413 or 400 Refusal.
export async function readBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY) throw new Refusal(413, 'tooLarge');
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > MAX_BODY) throw new Refusal(413, 'tooLarge');
  let body;
  try {
    body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new Refusal(400, 'body');
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Refusal(400, 'body');
  if (body.version !== undefined && !isVersion(body.version)) throw new Refusal(400, 'version');
  return body;
}

// The event row after checking the management secret. With lock, the row stays locked until the transaction ends.
export async function ownedEvent(tx, id, secret, { lock = true } = {}) {
  const event = (
    await tx.query(`select secret_hash, version, t, d from events where id = $1${lock ? ' for update' : ''}`, [id])
  ).rows[0];
  if (!event) throw new Refusal(404, 'eventMissing');
  if (!matches(secret, event.secret_hash)) throw new Refusal(403, 'eventForbidden');
  return event;
}
