-- Idempotence: empêche la création en double d'une commande lors d'un
-- double-clic ou d'une coupure réseau suivie d'une nouvelle tentative.
alter table public.orders
  add column if not exists idempotency_key text;

create unique index if not exists orders_user_idempotency_key_uidx
  on public.orders (user_id, idempotency_key)
  where idempotency_key is not null;

-- Idempotence paiement : un seul paiement "order_payment" par commande.
-- (les autres types comme wallet_recharge/boost_purchase ne sont pas concernés)
create unique index if not exists payments_order_payment_uidx
  on public.payments (order_id)
  where type = 'order_payment' and order_id is not null;
