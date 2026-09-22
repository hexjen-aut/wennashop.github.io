create or replace function public.update_shop_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
begin
  select p.shop_id into v_shop_id
  from public.products p
  where p.id = coalesce(NEW.product_id, OLD.product_id);

  if v_shop_id is not null then
    update public.shops s
    set rating_avg = coalesce((
          select round(avg(r.rating)::numeric, 2)
          from public.reviews r
          join public.products p on p.id = r.product_id
          where p.shop_id = v_shop_id and r.status = 'approved'
        ), 0),
        rating_count = coalesce((
          select count(*)
          from public.reviews r
          join public.products p on p.id = r.product_id
          where p.shop_id = v_shop_id and r.status = 'approved'
        ), 0)
    where s.id = v_shop_id;
  end if;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_update_shop_rating on public.reviews;
create trigger trg_update_shop_rating
after insert or update or delete on public.reviews
for each row execute function public.update_shop_rating();
