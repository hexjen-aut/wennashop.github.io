alter table public.shops add column if not exists is_official boolean not null default false;

-- Owners can update their own shop row (shops_owner_update), so the
-- official/verified badges must be locked to admins at the row level.
create or replace function public.shops_protect_badges()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if coalesce(get_my_role(), '') = 'admin' or current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_official := false;
    new.is_verified := false;
  else
    new.is_official := old.is_official;
    new.is_verified := old.is_verified;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_shops_protect_badges on public.shops;
create trigger trg_shops_protect_badges
before insert or update on public.shops
for each row execute function public.shops_protect_badges();

update public.shops set is_official = true where id = 'cddbd5cf-9540-4f6d-9a5e-b407e49b1bde';
