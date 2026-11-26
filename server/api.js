// The RSVP API: createApi(db) returns a handler from a Fetch API Request to a Response for every /api path.
// It owns routing, id checks and error mapping; the route modules in server/routes/ own the endpoints, and each
// module's header comment lists its endpoints and their contract. db has the Database shape of server/postgres.js.
// Bodies are JSON, every response has cache-control: no-store, and every error body is {error: message} with a
// message the page can show. Secrets arrive as Authorization: Bearer <secret>; the database keeps only their
// sha256 hex hashes, and no response or log line contains a secret, hash or SQL. Accept-Language picks only the
// error message language.
import { apiMessages, normalizeLang } from '../public/js/i18n.js';
import { ID_PATTERN, PARTY_LIMITS, REPLY_LIMITS } from '../public/js/rsvp.js';
import { DAILY_EVENTS } from './routes/events.js';
import { ROUTES } from './routes/index.js';
import { EVENT_PASSKEYS } from './routes/passkeys.js';
import { EVENT_RESPONSES } from './routes/replies.js';
import { json, Refusal } from './routes/shared.js';

const LIMITS = {
  replyNameLimit: REPLY_LIMITS.name,
  partySizeLimit: REPLY_LIMITS.partySize,
  replyNoteLimit: REPLY_LIMITS.note,
  dailyEvents: DAILY_EVENTS,
  eventResponses: EVENT_RESPONSES,
  eventPasskeys: EVENT_PASSKEYS,
  partyNameLimit: PARTY_LIMITS.name,
  defaultSeatsLimit: PARTY_LIMITS.seats,
  eventParties: PARTY_LIMITS.count,
};
const MESSAGES = {
  en: apiMessages('en', LIMITS),
  ro: apiMessages('ro', LIMITS),
};

const requestMessages = (request) => MESSAGES[normalizeLang(request.headers.get('accept-language') ?? 'en')];

// Each action gets {db, request, ids, dailyEvents}, where ids are the path captures, and returns the Response.
export function createApi(db, { dailyEvents = DAILY_EVENTS } = {}) {
  return async function handle(request) {
    const { pathname } = new URL(request.url);
    const messages = requestMessages(request);
    try {
      const route = ROUTES.find((r) => r.pattern.test(pathname));
      if (!route) throw new Refusal(404, 'path');
      const action = route.methods[request.method];
      if (!action) throw new Refusal(405, 'method');
      const ids = pathname.match(route.pattern).slice(1);
      if (!ids.every((id) => ID_PATTERN.test(id))) throw new Refusal(400, 'id');
      return await action({ db, request, ids, dailyEvents });
    } catch (error) {
      if (error instanceof Refusal) return json(error.status, { error: messages[error.code], ...error.extra });
      console.error('rsvp storage error', error?.code ?? 'unknown');
      return json(503, { error: messages.storage });
    }
  };
}
