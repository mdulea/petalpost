-- Records only the public ids of guest-list invitations deleted by the retention job, with no event details,
-- party names or replies, so their links and tracker can show "This invitation has ended" after deletion.
create table ended_events (
  id text primary key
);
