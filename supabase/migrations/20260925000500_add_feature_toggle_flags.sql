-- Admin on/off switches for whole features, restoring the old maintenance
-- button and adding three more: maintenance_mode already existed but had
-- no admin UI; quests_enabled/wallets_enabled/boosters_enabled are new.
insert into public.site_config (key, value) values
  ('quests_enabled', 'true'),
  ('wallets_enabled', 'true'),
  ('boosters_enabled', 'true')
on conflict (key) do nothing;
