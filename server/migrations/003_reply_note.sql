-- A reply's optional note to the host, such as a dietary need. An empty note means the guest wrote none, so existing
-- replies get one.
alter table responses add column note text not null default '' check (char_length(note) <= 300);
