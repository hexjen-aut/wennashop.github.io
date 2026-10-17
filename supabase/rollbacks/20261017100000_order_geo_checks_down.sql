do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-order-geo-positions') then
    perform cron.unschedule('purge-order-geo-positions');
  end if;
end $$;
drop function if exists public.purge_order_geo_positions();
drop function if exists public.order_geo_check(uuid);
drop table if exists public.order_geo_checks;
