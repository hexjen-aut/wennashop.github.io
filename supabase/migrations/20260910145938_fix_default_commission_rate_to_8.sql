-- Le taux de commission WennaShop annoncé partout dans l'app est 8%, mais la
-- colonne shops.commission_rate avait un défaut de 10 en base et aucune UI ne
-- permet à un admin de fixer un taux différent par boutique : ce n'était donc
-- pas un choix, juste une valeur par défaut incorrecte qui s'appliquait à
-- toute boutique créée sans passer explicitement commission_rate: 8.
alter table public.shops alter column commission_rate set default 8;
update public.shops set commission_rate = 8, updated_at = now() where commission_rate = 10;
