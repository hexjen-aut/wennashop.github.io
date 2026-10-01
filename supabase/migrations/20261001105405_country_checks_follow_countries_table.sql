-- products.country et quests.country_target étaient limités à une liste
-- figée d'anciennes écritures sans accent ('Senegal', 'Benin',
-- 'Cote d Ivoire', 'RDC'…) alors que le site envoie les noms de la table
-- countries ('Sénégal', 'Bénin', "Côte d'Ivoire", 'RD Congo'…) : créer un
-- produit au Sénégal, ou une quête avec le choix par défaut « Les deux »,
-- échouait. La validation suit désormais la table countries.

alter table public.products drop constraint if exists products_country_check;
alter table public.quests drop constraint if exists quests_country_target_check;

create or replace function public.validate_country_columns()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v text;
  extra text[];
begin
  if tg_table_name = 'products' then
    v := new.country; extra := array['Autre'];
  else
    v := new.country_target; extra := array['Autre', 'Afrique', 'Les deux'];
  end if;
  if v is null or v = any(extra) or exists (select 1 from public.countries where name = v) then
    return new;
  end if;
  raise exception 'Pays inconnu : %', v using errcode = '23514';
end;
$$;

drop trigger if exists trg_products_validate_country on public.products;
create trigger trg_products_validate_country
before insert or update of country on public.products
for each row execute function public.validate_country_columns();

drop trigger if exists trg_quests_validate_country on public.quests;
create trigger trg_quests_validate_country
before insert or update of country_target on public.quests
for each row execute function public.validate_country_columns();
