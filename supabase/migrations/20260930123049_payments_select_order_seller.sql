-- La section Revenus du dashboard vendeur lit les paiements de ses commandes ;
-- seuls l'acheteur et l'admin pouvaient les voir, donc un vendeur (ou un
-- membre de son équipe) voyait toujours 0.
drop policy if exists payments_select_order_seller on public.payments;
create policy payments_select_order_seller on public.payments for select using (
  order_id is not null and public.is_order_seller(order_id)
);
