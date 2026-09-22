insert into public.boost_packs (name, slug, description, duration_days, price_fcfa, price_mad, features, is_active, sort_order)
values ('Mise en avant manuelle', 'admin-manuel', 'Mise en avant activée directement par l''administration WennaShop, sans passer par un achat vendeur.', 30, 0, 0, '{}', true, 0)
on conflict (slug) do nothing;
