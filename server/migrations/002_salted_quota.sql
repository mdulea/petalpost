-- The creation counter keys on sha256(salt || IP) with a random salt per UTC day, because an unsalted hash of an
-- IPv4 address is reversed by hashing all 2^32 addresses. A day's salt is deleted with that day's counts, after
-- which nobody can test an address against them. Existing counts have unsalted keys, so they are deleted.
create table quota_salts (
  day date primary key,
  salt text not null default gen_random_uuid()::text
);

delete from creation_quota;
