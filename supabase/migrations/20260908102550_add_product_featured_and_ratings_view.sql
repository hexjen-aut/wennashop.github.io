alter table public.products add column if not exists is_featured boolean not null default false;

create or replace view public.product_ratings as
select product_id, round(avg(rating)::numeric, 2) as avg_rating, count(*) as review_count
from public.reviews
where status = 'approved'
group by product_id;
