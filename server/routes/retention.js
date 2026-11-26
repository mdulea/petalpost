// The retention route of server/api.js:
//
// GET /api/retention                       public; deletes expired events, parties and responses; {deleted}
//
// A guest-list invitation expires at 23:59 Europe/Bucharest time on the day after its event date, and its id is
// recorded in ended_events so every link and the tracker can show "This invitation has ended" without event details.
// An open invitation expires RETENTION_DAYS days after the later of its event date and its last change; an open
// invitation without a date counts only from its last change. Vercel Cron calls /api/retention daily (vercel.json).
// The route takes no secret, because it deletes only what the next scheduled run deletes and repeating it changes
// nothing.
import { json } from './shared.js';

const RETENTION_DAYS = 90;

export const routes = [{ pattern: /^\/api\/retention$/, methods: { GET: deleteExpired } }];

async function deleteExpired({ db, now }) {
  const timestamp = now().toISOString();
  const { rows } = await db.query(
    `with deleted as (
       delete from events
       where case
         when d->>'mode' = 'guestList' and nullif(d->>'date', '') is not null
           then $2::timestamptz >= (((d->>'date')::date + 1) + time '23:59') at time zone 'Europe/Bucharest'
         else greatest(nullif(d->>'date', '')::date, (updated_at at time zone 'utc')::date) < ($2::timestamptz at time zone 'utc')::date - $1::int
       end
       returning id, d->>'mode' as mode
     ),
     recorded as (
       insert into ended_events (id)
       select id from deleted where mode = 'guestList'
       on conflict (id) do nothing
     )
     select count(*)::int as deleted from deleted`,
    [RETENTION_DAYS, timestamp],
  );
  return json(200, { deleted: rows[0].deleted });
}
