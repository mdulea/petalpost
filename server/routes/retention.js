// The retention route of server/api.js:
//
// GET /api/retention                       public; deletes expired events and their responses; {deleted}
//
// An event expires RETENTION_DAYS days after the later of its event date and its last change; an event without a
// date counts only from its last change. Vercel Cron calls /api/retention daily (vercel.json). The route takes no
// secret, because it deletes only what the next scheduled run deletes and repeating it changes nothing.
import { json, today } from './shared.js';

const RETENTION_DAYS = 90;

export const routes = [{ pattern: /^\/api\/retention$/, methods: { GET: deleteExpired } }];

async function deleteExpired({ db }) {
  const { rows } = await db.query(
    `delete from events
     where greatest(nullif(d->>'date', '')::date, (updated_at at time zone 'utc')::date) < ${today} - $1::int
     returning 1`,
    [RETENTION_DAYS],
  );
  return json(200, { deleted: rows.length });
}
