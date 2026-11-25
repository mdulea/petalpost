-- Anonymous totals of a fixed set of actions per UTC day and page language. A row holds no cookie, identifier,
-- IP address or invitation content, and the retention job keeps every row.
create table action_counts (
  day date not null,
  action text not null,
  lang text not null check (lang in ('en', 'ro')),
  count int not null check (count > 0),
  primary key (day, action, lang)
);
