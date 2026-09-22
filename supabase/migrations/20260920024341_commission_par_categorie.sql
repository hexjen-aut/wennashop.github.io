-- =====================================================================
-- WennaShop — Commission par catégorie
-- Priorité du taux appliqué :
--   1. shops.commission_rate (dérogation explicite, si non NULL)
--   2. Taux de la catégorie du produit
--   3. Taux de la catégorie parente
--   4. Taux par défaut : 8 %
-- Le taux est figé dans order_items au moment de la commande (snapshot).
-- =====================================================================

-- 1. Taux par catégorie ------------------------------------------------
alter table public.categories
  add column if not exists commission_rate numeric(5,2)
  check (commission_rate is null or (commission_rate >= 0 and commission_rate <= 30));

comment on column public.categories.commission_rate is
  'Commission WennaShop en %. NULL = hérite du parent, puis 8 % par défaut.';

update public.categories set commission_rate = 6
where parent_id is null and slug in (
  'electronique-informatique', 'ordinateur', 'energie-anti-delestage',
  'epicerie-quotidien', 'alimentation', 'auto-moto'
);

update public.categories set commission_rate = 10
where parent_id is null and slug in (
  'maison-cuisine', 'maison', 'bricolage-jardin', 'bebe-enfants-jouets',
  'sport-loisirs', 'bureau-papeterie', 'animaux', 'sante-bien-etre',
  'textile', 'services'
);

update public.categories set commission_rate = 13
where parent_id is null and slug in (
  'mode-accessoires', 'mode', 'beaute-soins', 'bijoux', 'art',
  'ceramique', 'produits-afro-made-in'
);

-- 2. shops.commission_rate devient la dérogation --------------------
--    (colonne déjà existante ; on retire le 8% par défaut qui masquait
--     les taux par catégorie pour toutes les boutiques)
comment on column public.shops.commission_rate is
  'Dérogation admin en %, prioritaire sur la catégorie. NULL = suit la catégorie du produit.';

update public.shops set commission_rate = null where commission_rate = 8;

-- 3. Snapshot de la commission sur chaque ligne de commande -----------
alter table public.order_items
  add column if not exists shop_id uuid references public.shops(id),
  add column if not exists commission_rate numeric(5,2),
  add column if not exists commission_amount numeric(12,2);

-- 4. Calcul du taux applicable -----------------------------------------
create or replace function public.resolve_commission_rate(p_product_id uuid)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    s.commission_rate,
    c.commission_rate,
    pc.commission_rate,
    8
  )
  from products p
  left join shops s       on s.id  = p.shop_id
  left join categories c  on c.id  = p.category_id
  left join categories pc on pc.id = c.parent_id
  where p.id = p_product_id;
$$;

-- 5. Trigger : fige le taux à l'insertion (écrase toute valeur envoyée
--    par le client, pour empêcher la manipulation) --------------------
create or replace function public.order_items_set_commission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select p.shop_id into new.shop_id
  from products p
  where p.id = new.product_id;

  new.commission_rate   := coalesce(public.resolve_commission_rate(new.product_id), 8);
  new.commission_amount := round(new.unit_price * new.quantity * new.commission_rate / 100, 2);
  return new;
end;
$$;

drop trigger if exists trg_order_items_commission on public.order_items;
create trigger trg_order_items_commission
  before insert on public.order_items
  for each row execute function public.order_items_set_commission();

-- 6. Rattrapage des lignes existantes ----------------------------------
update public.order_items oi
set shop_id           = p.shop_id,
    commission_rate   = coalesce(public.resolve_commission_rate(oi.product_id), 8),
    commission_amount = round(oi.unit_price * oi.quantity
                        * coalesce(public.resolve_commission_rate(oi.product_id), 8) / 100, 2)
from products p
where p.id = oi.product_id
  and oi.commission_rate is null;
