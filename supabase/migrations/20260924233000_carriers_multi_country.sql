-- A carrier can now cover several countries (not just one). No carriers
-- exist yet in production, so this is a clean column swap with no backfill
-- needed: drop the single `country` text column, add `countries text[]`.
-- `scope='international'` still means "all countries" (kept as a shortcut
-- so admins don't have to tick every country by hand); `countries` is only
-- consulted for scope='local' carriers.
alter table public.carriers drop column country;
alter table public.carriers add column countries text[] not null default '{}';
