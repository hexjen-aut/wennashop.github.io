-- Phase 54 (MVP) : pays et villes pilotés par la base, plus en dur dans le
-- frontend. Le nom (colonne `name`) reste le libellé canonique déjà stocké
-- dans users.country / shops.country (ex. "Maroc"), pour ne rien casser.

create table if not exists public.countries (
  code text primary key,                 -- ISO 3166-1 alpha-2, ex. 'MA'
  name text not null unique,             -- libellé canonique, ex. 'Maroc'
  currency_code text,                    -- ex. 'MAD'
  phone_prefix text,                     -- ex. '+212'
  flag_emoji text,
  status text not null default 'ACTIVE' check (status in ('PLANNED','BETA','ACTIVE','PAUSED','SUSPENDED')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cities (
  id uuid primary key default gen_random_uuid(),
  country_code text not null references public.countries(code) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists cities_country_code_idx on public.cities(country_code);
create unique index if not exists cities_country_name_uidx on public.cities(country_code, name);

alter table public.countries enable row level security;
alter table public.cities enable row level security;

create policy "Public read countries" on public.countries for select using (true);
create policy "countries_insert_admin" on public.countries for insert with check (get_my_role() = 'admin');
create policy "countries_update_admin" on public.countries for update using (get_my_role() = 'admin');
create policy "countries_delete_admin" on public.countries for delete using (get_my_role() = 'admin');

create policy "Public read cities" on public.cities for select using (true);
create policy "cities_insert_admin" on public.cities for insert with check (get_my_role() = 'admin');
create policy "cities_update_admin" on public.cities for update using (get_my_role() = 'admin');
create policy "cities_delete_admin" on public.cities for delete using (get_my_role() = 'admin');

-- Seed : reprend l'union de toutes les listes de pays actuellement en dur
-- dans le frontend (connexion, compte, vendeur, boutique).
insert into public.countries (code, name, currency_code, phone_prefix, flag_emoji, status, sort_order) values
  ('MA','Maroc','MAD','+212','🇲🇦','ACTIVE',10),
  ('GA','Gabon','XAF','+241','🇬🇦','ACTIVE',20),
  ('SN','Sénégal','XOF','+221','🇸🇳','ACTIVE',30),
  ('CI','Côte d''Ivoire','XOF','+225','🇨🇮','ACTIVE',40),
  ('CM','Cameroun','XAF','+237','🇨🇲','ACTIVE',50),
  ('CG','Congo','XAF','+242','🇨🇬','ACTIVE',60),
  ('CD','RD Congo','CDF','+243','🇨🇩','ACTIVE',70),
  ('BJ','Bénin','XOF','+229','🇧🇯','ACTIVE',80),
  ('TG','Togo','XOF','+228','🇹🇬','ACTIVE',90),
  ('ML','Mali','XOF','+223','🇲🇱','ACTIVE',100),
  ('BF','Burkina Faso','XOF','+226','🇧🇫','ACTIVE',110),
  ('GN','Guinée','GNF','+224','🇬🇳','ACTIVE',120),
  ('DZ','Algérie','DZD','+213','🇩🇿','ACTIVE',130),
  ('TN','Tunisie','TND','+216','🇹🇳','ACTIVE',140),
  ('NE','Niger','XOF','+227','🇳🇪','ACTIVE',150),
  ('TD','Tchad','XAF','+235','🇹🇩','ACTIVE',160),
  ('MR','Mauritanie','MRU','+222','🇲🇷','ACTIVE',170),
  ('MG','Madagascar','MGA','+261','🇲🇬','ACTIVE',180),
  ('KM','Comores','KMF','+269','🇰🇲','ACTIVE',190),
  ('DJ','Djibouti','DJF','+253','🇩🇯','ACTIVE',200),
  ('CF','Centrafrique','XAF','+236','🇨🇫','ACTIVE',210)
on conflict (code) do nothing;

insert into public.cities (country_code, name, sort_order) values
  ('MA','Casablanca',10), ('MA','Rabat',20), ('MA','Marrakech',30), ('MA','Tanger',40), ('MA','Fès',50),
  ('GA','Libreville',10), ('GA','Port-Gentil',20), ('GA','Franceville',30),
  ('SN','Dakar',10), ('SN','Thiès',20),
  ('CI','Abidjan',10), ('CI','Yamoussoukro',20)
on conflict (country_code, name) do nothing;

-- Nettoyage : corrige les valeurs déjà incohérentes (ex. 'maroc' saisi par
-- l'ancien formulaire d'inscription qui utilisait un slug au lieu du libellé).
update public.users set country = 'Maroc' where lower(country) = 'maroc' and country <> 'Maroc';
update public.users set country = 'Gabon' where lower(country) = 'gabon' and country <> 'Gabon';
update public.shops set country = 'Maroc' where lower(country) = 'maroc' and country <> 'Maroc';
update public.shops set country = 'Gabon' where lower(country) = 'gabon' and country <> 'Gabon';
