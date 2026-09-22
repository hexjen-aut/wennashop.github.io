-- 1. Supprimer la table subscriptions
DROP TABLE IF EXISTS public.subscriptions CASCADE;

-- 2. Supprimer subscription_plan de users
ALTER TABLE public.users DROP COLUMN IF EXISTS subscription_plan;

-- 3. Drop les vieux constraints
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_country_check;
ALTER TABLE public.quests DROP CONSTRAINT IF EXISTS quests_country_target_check;

-- 4. Migrer "Les deux" dans quests
UPDATE public.quests SET country_target = 'Afrique' WHERE country_target = 'Les deux';

-- 5. Nouveau check products.country (liste Afrique)
ALTER TABLE public.products ADD CONSTRAINT products_country_check
  CHECK (country = ANY (ARRAY['Cote d Ivoire','Senegal','Cameroun','Burkina Faso','Mali','Togo','Benin','Niger','Congo','RDC','Gabon','Maroc','Tunisie','Madagascar','Autre']));

-- 6. Nouveau check quests.country_target
ALTER TABLE public.quests ADD CONSTRAINT quests_country_target_check
  CHECK (country_target = ANY (ARRAY['Cote d Ivoire','Senegal','Cameroun','Burkina Faso','Mali','Togo','Benin','Niger','Congo','RDC','Gabon','Maroc','Tunisie','Madagascar','Afrique','Autre']));
