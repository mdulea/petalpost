-- Existing links keep their original derivation until the host regenerates them.
alter table parties add column link_generation text;
