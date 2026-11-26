-- The tables and columns of the guest-list features. The invitation settings, which are the mode, sub-events, menu
-- options, deadline, update notice and published-plan flag, live in events.d, so this file adds no event column.
-- Deleting an event deletes its parties, their replies, its tables, its passkeys, its challenges and its tokens.
-- Existing rows keep their values, and the deployed code reads and writes the same columns as before.

-- A table of the seating plan. The plan has no row of its own, because its published flag lives in events.d.
create table seating_tables (
  id text primary key,
  event_id text not null references events (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  capacity int not null check (capacity >= 1),
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index seating_tables_event_id on seating_tables (event_id);

-- A guest-list entry. sub_events lists the ids of the sub-events in events.d that the party is invited to.
-- secret_hash and view_hash are the sha256 hex hashes of the personal link and view link secrets. A first and
-- last opened time are null until a personal link secret loads the party. Deleting a table unassigns its parties.
create table parties (
  id text primary key,
  event_id text not null references events (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  lang text not null check (lang in ('en', 'ro')),
  default_seats int not null check (default_seats between 1 and 20),
  sub_events jsonb not null default '[]',
  secret_hash text not null,
  view_hash text not null,
  revoked boolean not null default false,
  first_opened_at timestamptz,
  last_opened_at timestamptz,
  table_id text references seating_tables (id) on delete set null,
  version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index parties_event_id on parties (event_id);

create index parties_table_id on parties (table_id);

-- A reply belongs to a party, or to nobody in the open mode and after a switch until the host attaches it. A party
-- reply has no reply edit link, so it has no secret hash, and attaching a reply clears its secret hash. answers maps
-- a sub-event id to {attending, partySize}, and meals maps a menu option id to its count. An empty object means the
-- invitation had no sub-events or menu options. A party reply allows up to 20 people and an open reply up to 10.
alter table responses add column party_id text unique references parties (id) on delete cascade;

alter table responses add column answers jsonb not null default '{}';

alter table responses add column meals jsonb not null default '{}';

alter table responses alter column secret_hash drop not null;

alter table responses add constraint responses_link check ((party_id is null) = (secret_hash is not null));

alter table responses drop constraint responses_check;

alter table responses add constraint responses_party_size check (
  (attending and party_size between 1 and (case when party_id is null then 10 else 20 end))
  or (not attending and party_size = 0)
);

-- A passkey that opens one invitation's management API. id is the WebAuthn credential id and public_key the COSE
-- public key, both base64url. sign_count is the authenticator's last signature counter.
create table passkeys (
  id text primary key,
  event_id text not null references events (id) on delete cascade,
  public_key text not null,
  sign_count bigint not null default 0,
  created_at timestamptz not null default now()
);

create index passkeys_event_id on passkeys (event_id);

-- A WebAuthn challenge the server issued and has not yet seen answered. A registration challenge belongs to an
-- event, and a sign-in challenge, which runs without a known invitation, has a null event_id.
create table passkey_challenges (
  challenge text primary key,
  event_id text references events (id) on delete cascade,
  expires_at timestamptz not null
);

-- A short-lived token that a passkey sign-in returns in place of the management secret, stored as its sha256 hex hash.
create table access_tokens (
  token_hash text primary key,
  event_id text not null references events (id) on delete cascade,
  expires_at timestamptz not null
);
