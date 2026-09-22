-- Aucune notification n'existait pour prévenir l'admin quand quelqu'un
-- s'inscrit — le compte est bien créé (la table users l'a), mais personne
-- n'est informé. Ajoute une notification (+ email automatique, via le
-- pipeline déjà en place sur la table notifications) à chaque admin
-- lors d'une nouvelle inscription.
create or replace function public.notify_admin_new_user()
returns trigger
language plpgsql
security definer
as $$
declare
  admin_row record;
  role_label text;
begin
  role_label := case new.role
    when 'artisan' then 'vendeur'
    when 'chasseur' then 'chasseur'
    else 'acheteur'
  end;
  for admin_row in select id from public.users where role = 'admin' loop
    insert into public.notifications (user_id, type, title, body, link)
    values (
      admin_row.id,
      'new_user_signup',
      'Nouvelle inscription',
      coalesce(new.full_name, new.email) || ' (' || new.email || ') vient de s''inscrire en tant que ' || role_label || '.',
      '/admin'
    );
  end loop;
  return new;
end;
$$;

drop trigger if exists trg_notify_admin_new_user on public.users;
create trigger trg_notify_admin_new_user
  after insert on public.users
  for each row
  execute function public.notify_admin_new_user();
