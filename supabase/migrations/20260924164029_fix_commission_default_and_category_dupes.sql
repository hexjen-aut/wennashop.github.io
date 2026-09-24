-- resolve_commission_rate() falls back in order: shop rate, category rate,
-- parent category rate, then 8. But shops.commission_rate defaulted to 8,
-- so every shop that never explicitly set a rate (i.e. almost all of them)
-- always matched on the first coalesce branch — the category grid (6/10/13
-- by category, seeded earlier) was never actually reached. Dropping the
-- default and nulling out shops that only ever had it lets the grid apply;
-- shop.commission_rate is now reserved for genuinely negotiated rates.
alter table public.shops alter column commission_rate drop default;
update public.shops set commission_rate = null where commission_rate = 8;

-- Duplicate root categories that split the same product family in two,
-- each carrying its own (identical) commission rate. Move any products off
-- the duplicate onto the kept category, then drop the duplicate — checked
-- beforehand that none of the four has child categories of its own.
update public.products set category_id = 'a0ab3fb8-f3f1-41ae-b14e-f801ca5199f9' where category_id = 'd1c2dc3b-f46a-4970-846a-03752e5a2cd6'; -- mode -> Mode & accessoires
delete from public.categories where id = 'd1c2dc3b-f46a-4970-846a-03752e5a2cd6';

update public.products set category_id = '96f29d06-84cc-4f95-8a7d-ec9e7f70f7ff' where category_id = '7a6ced28-0365-4ece-ac52-6007505bbcd6'; -- Maison -> Maison & cuisine
delete from public.categories where id = '7a6ced28-0365-4ece-ac52-6007505bbcd6';

update public.products set category_id = '4d217d01-cf7a-431d-a35e-c1035f215e59' where category_id = '6a36f227-679f-4791-8958-d5efc2d0e926'; -- Ordinateur -> Électronique & informatique
delete from public.categories where id = '6a36f227-679f-4791-8958-d5efc2d0e926';

update public.products set category_id = 'b35750ea-009c-4e20-b48b-559217943f33' where category_id = 'd46b9e7f-5061-47e2-8629-61fd825390c5'; -- Bijoux -> Bijoux & montres (déjà sous-catégorie de Mode & accessoires)
delete from public.categories where id = 'd46b9e7f-5061-47e2-8629-61fd825390c5';
