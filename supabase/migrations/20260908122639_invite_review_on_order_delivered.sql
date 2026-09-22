create or replace function public.invite_review_on_delivered()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  item record;
begin
  for item in
    select distinct p.id as product_id, p.name as product_name
    from order_items oi
    join products p on p.id = oi.product_id
    where oi.order_id = new.id
  loop
    insert into notifications (user_id, type, title, body, link)
    values (
      new.user_id,
      'review',
      'Comment était votre commande ?',
      'Vous avez reçu "' || item.product_name || '" — partagez votre avis pour aider les autres acheteurs.',
      '/produit?id=' || item.product_id
    );
  end loop;
  return new;
end;
$function$;

create trigger trg_invite_review_on_delivered
after update on public.orders
for each row
when (old.status is distinct from 'delivered' and new.status = 'delivered')
execute function public.invite_review_on_delivered();
