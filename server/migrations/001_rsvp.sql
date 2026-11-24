-- Published invitations, guest responses and the daily event creation counter.
-- Secrets are stored only as sha256 hex hashes.
create table events (
  id text primary key,
  secret_hash text not null,
  t text not null,
  d jsonb not null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table responses (
  id text primary key,
  event_id text not null references events (id) on delete cascade,
  secret_hash text not null,
  name text not null check (char_length(name) between 1 and 80),
  attending boolean not null,
  party_size int not null check ((attending and party_size between 1 and 10) or (not attending and party_size = 0)),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index responses_event_id on responses (event_id);

-- client is the sha256 hex hash of the client IP; day is the UTC date.
create table creation_quota (
  client text not null,
  day date not null,
  count int not null,
  primary key (client, day)
);
