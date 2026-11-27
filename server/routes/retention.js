// The retention route of server/api.js:
//
// GET /api/retention                       public; deletes expired events, parties and responses; {deleted}
//
// The event date is the latest date of an invitation's sub-events, or the invitation's date when no sub-event has one.
// A guest-list invitation expires at 23:59 Europe/Bucharest time on the day after its event date, and its id is
// recorded in ended_events so every link and the tracker can show "This invitation has ended" without event details.
// An open invitation expires RETENTION_DAYS days after the later of its event date and its last change; an open
// invitation without a date counts only from its last change. Vercel Cron calls /api/retention daily (vercel.json).
// The route takes no secret, because it deletes only what the next scheduled run deletes and repeating it changes
// nothing.
import { json } from './shared.js';

const RETENTION_DAYS = 90;

export const routes = [{ pattern: /^\/api\/retention$/, methods: { GET: deleteExpired } }];

// SQL expression that casts expr to date only when it is a real YYYY-MM-DD calendar date, returning null otherwise
// so a malformed date on one row cannot abort retention for other invitations.
const safeDate = (expr) => `case
  when (${expr}) ~ '^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$'
    and substr(${expr}, 1, 4)::int >= 1
    and (
      substr(${expr}, 6, 2) not in ('02', '04', '06', '09', '11')
      or (substr(${expr}, 6, 2) in ('04', '06', '09', '11') and substr(${expr}, 9, 2)::int <= 30)
      or (substr(${expr}, 6, 2) = '02' and (
        substr(${expr}, 9, 2)::int <= 28
        or (substr(${expr}, 9, 2)::int = 29 and (
          (substr(${expr}, 1, 4)::int % 4 = 0 and substr(${expr}, 1, 4)::int % 100 <> 0)
          or substr(${expr}, 1, 4)::int % 400 = 0
        ))
      ))
    )
  then (${expr})::date
end`;

async function deleteExpired({ db, now }) {
  const timestamp = now().toISOString();
  const { rows } = await db.query(
    `with dated as (
       select id, d->>'mode' as mode, updated_at, coalesce(
         (select max(${safeDate("s->>'date'")}) from jsonb_array_elements(coalesce(d->'subEvents', '[]')) s),
         ${safeDate("d->>'date'")}
       ) as event_date
       from events
     ),
     deleted as (
       delete from events e
       using dated
       where e.id = dated.id and case
         when dated.mode = 'guestList' and dated.event_date is not null
           then $2::timestamptz >= ((dated.event_date + 1) + time '23:59') at time zone 'Europe/Bucharest'
         else greatest(dated.event_date, (dated.updated_at at time zone 'utc')::date) < ($2::timestamptz at time zone 'utc')::date - $1::int
       end
       returning e.id, dated.mode
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
