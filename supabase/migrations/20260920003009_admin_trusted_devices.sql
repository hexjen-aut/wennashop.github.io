create table if not exists admin_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null,
  label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '90 days'),
  unique(user_id, token_hash)
);

create index if not exists idx_admin_trusted_devices_user on admin_trusted_devices(user_id);

alter table admin_trusted_devices enable row level security;

create policy "admin manage own devices" on admin_trusted_devices
  for all
  using (user_id in (select id from users where auth_id = auth.uid() and role = 'admin'))
  with check (user_id in (select id from users where auth_id = auth.uid() and role = 'admin'));
