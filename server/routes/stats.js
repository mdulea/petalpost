// The stats route of server/api.js:
//
// POST /api/stats                          public; {action, lang} adds 1 to a browser action's count; 204
//
// It counts only the BEACON_ACTIONS under exactly en or ro, reads no IP address and has no cap, so its totals are
// approximate.
import { normalizeLang } from '../../public/js/i18n.js';
import { BEACON_ACTIONS } from '../../public/js/rsvp.js';
import { addCount, json, readBody, Refusal } from './shared.js';

export const routes = [{ pattern: /^\/api\/stats$/, methods: { POST: countBeacon } }];

async function countBeacon({ db, request }) {
  const { action, lang } = await readBody(request);
  if (!BEACON_ACTIONS.includes(action) || normalizeLang(lang) !== lang) throw new Refusal(400, 'body');
  await addCount(db, action, lang);
  return json(204, null);
}
