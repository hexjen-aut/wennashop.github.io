-- Ajouter les colonnes manquantes
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES categories(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Index pour les requêtes par parent
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON categories(is_active);
CREATE INDEX IF NOT EXISTS idx_categories_sort_order ON categories(sort_order);

-- Insérer les catégories parentes (is_active = false par défaut)
INSERT INTO categories (name, slug, icon, description, is_active, sort_order) VALUES
  ('Mode & accessoires',           'mode-accessoires',          '', 'Vêtements, chaussures, bijoux',                false, 1),
  ('Beauté & soins',               'beaute-soins',              '', 'Maquillage, parfums, soins',                  false, 2),
  ('Santé & bien-être',            'sante-bien-etre',           '', 'Compléments, hygiène, premiers secours',      false, 3),
  ('Électronique & informatique',  'electronique-informatique', '', 'Smartphones, audio, gaming, réseaux',         false, 4),
  ('Maison & cuisine',             'maison-cuisine',            '', 'Électroménager, déco, literie',               false, 5),
  ('Bricolage & jardin',           'bricolage-jardin',          '', 'Outils, jardinage, plomberie',                false, 6),
  ('Bébé, enfants & jouets',       'bebe-enfants-jouets',       '', 'Puériculture, jouets, scolaire',              false, 7),
  ('Sport & loisirs',              'sport-loisirs',             '', 'Fitness, football, camping, vélos',           false, 8),
  ('Auto & moto',                  'auto-moto',                 '', 'Accessoires auto, entretien, moto',           false, 9),
  ('Épicerie & quotidien',         'epicerie-quotidien',        '', 'Boissons, snacks, entretien maison',          false, 10),
  ('Produits afro & Made in',      'produits-afro-made-in',     '', 'Cheveux afro, pagnes, artisanat, épices',     false, 11),
  ('Bureau & papeterie',           'bureau-papeterie',          '', 'Fournitures, impression, organisation',       false, 12),
  ('Animaux',                      'animaux',                   '', 'Nourriture, hygiène, accessoires animaux',    false, 13),
  ('Services',                     'services',                  '', 'Livraison express, Click & Collect, retours', false, 14)
ON CONFLICT (slug) DO NOTHING;

-- Insérer les sous-catégories (liées aux parents par slug)
WITH parents AS (SELECT id, slug FROM categories WHERE parent_id IS NULL)
INSERT INTO categories (name, slug, icon, description, parent_id, is_active, sort_order)
SELECT sub.name, sub.slug, '', sub.description, parents.id, false, sub.sort_order
FROM (VALUES
  -- Mode & accessoires
  ('Vêtements femme',         'mode-vetements-femme',        'mode-accessoires',          'Robes, hauts, pantalons femme',      1),
  ('Vêtements homme',         'mode-vetements-homme',        'mode-accessoires',          'Chemises, pantalons, costumes',      2),
  ('Vêtements enfant & bébé', 'mode-vetements-enfant',       'mode-accessoires',          'Tenues enfant et nourrisson',        3),
  ('Chaussures',              'mode-chaussures',             'mode-accessoires',          'Sneakers, sandales, escarpins',      4),
  ('Sacs & bagagerie',        'mode-sacs-bagagerie',         'mode-accessoires',          'Sacs à main, valises, sacs de voyage',5),
  ('Bijoux & montres',        'mode-bijoux-montres',         'mode-accessoires',          'Colliers, bracelets, montres',       6),
  ('Accessoires',             'mode-accessoires-divers',     'mode-accessoires',          'Ceintures, lunettes, chapeaux',      7),
  -- Beauté & soins
  ('Maquillage',              'beaute-maquillage',           'beaute-soins',              'Fond de teint, rouges à lèvres',     1),
  ('Soins visage',            'beaute-soins-visage',         'beaute-soins',              'Crèmes, sérums, masques',            2),
  ('Soins corps',             'beaute-soins-corps',          'beaute-soins',              'Lotions, gels douche, huiles',       3),
  ('Parfums',                 'beaute-parfums',              'beaute-soins',              'Eaux de parfum et toilette',         4),
  ('Cheveux',                 'beaute-cheveux',              'beaute-soins',              'Shampoings, perruques, mèches',      5),
  ('Barbe & rasage',          'beaute-barbe-rasage',         'beaute-soins',              'Rasoirs, baumes, soins barbe',       6),
  -- Santé & bien-être
  ('Compléments alimentaires','sante-complements',           'sante-bien-etre',           'Vitamines, protéines, oméga',        1),
  ('Premiers secours',        'sante-premiers-secours',      'sante-bien-etre',           'Bandages, antiseptiques, trousses',  2),
  ('Hygiène',                 'sante-hygiene',               'sante-bien-etre',           'Savons, dentifrices, déodorants',    3),
  ('Appareils médicaux',      'sante-appareils-medicaux',    'sante-bien-etre',           'Thermomètres, tensiomètres',         4),
  -- Électronique & informatique
  ('Smartphones & accessoires','elec-smartphones',           'electronique-informatique', 'Téléphones, coques, chargeurs',      1),
  ('Audio',                   'elec-audio',                  'electronique-informatique', 'Écouteurs, enceintes, casques',      2),
  ('Ordinateurs & accessoires','elec-ordinateurs',           'electronique-informatique', 'Laptops, souris, claviers',          3),
  ('Gaming',                  'elec-gaming',                 'electronique-informatique', 'Consoles, manettes, accessoires',    4),
  ('Réseaux & stockage',      'elec-reseaux-stockage',       'electronique-informatique', 'Routeurs, disques durs, clés USB',   5),
  -- Maison & cuisine
  ('Petit électroménager',    'maison-electromenager',       'maison-cuisine',            'Mixeurs, cafetières, grille-pain',   1),
  ('Ustensiles & vaisselle',  'maison-ustensiles',           'maison-cuisine',            'Casseroles, assiettes, verres',      2),
  ('Rangement & organisation','maison-rangement',            'maison-cuisine',            'Boîtes, étagères, organisateurs',    3),
  ('Literie',                 'maison-literie',              'maison-cuisine',            'Draps, couettes, oreillers',         4),
  ('Déco intérieure',         'maison-deco',                 'maison-cuisine',            'Tableaux, bougies, vases',           5),
  -- Bricolage & jardin
  ('Outils & quincaillerie',  'brico-outils',                'bricolage-jardin',          'Perceuses, marteaux, visseries',     1),
  ('Peinture & rénovation',   'brico-peinture',              'bricolage-jardin',          'Peintures, pinceaux, enduits',       2),
  ('Jardinage',               'brico-jardinage',             'bricolage-jardin',          'Pots, terreau, outils jardin',       3),
  ('Plomberie & électricité', 'brico-plomberie',             'bricolage-jardin',          'Tuyaux, câbles, interrupteurs',      4),
  -- Bébé, enfants & jouets
  ('Puériculture',            'bebe-puericulture',           'bebe-enfants-jouets',       'Poussettes, biberons, couches',      1),
  ('Jouets',                  'bebe-jouets',                 'bebe-enfants-jouets',       'Peluches, puzzles, jeux de société', 2),
  ('Fournitures scolaires',   'bebe-fournitures-scolaires',  'bebe-enfants-jouets',       'Cahiers, stylos, cartables',         3),
  ('Livres pour enfants',     'bebe-livres',                 'bebe-enfants-jouets',       'Albums, BD, livres éducatifs',       4),
  -- Sport & loisirs
  ('Fitness',                 'sport-fitness',               'sport-loisirs',             'Haltères, tapis, élastiques',        1),
  ('Football',                'sport-football',              'sport-loisirs',             'Ballons, crampons, maillots',        2),
  ('Camping & randonnée',     'sport-camping',               'sport-loisirs',             'Tentes, sacs de couchage, lampes',   3),
  ('Vélos & accessoires',     'sport-velos',                 'sport-loisirs',             'Vélos, casques, antivols',           4),
  ('Piscine & plage',         'sport-piscine-plage',         'sport-loisirs',             'Maillots, bouées, parasols',         5),
  -- Auto & moto
  ('Accessoires auto',        'auto-accessoires',            'auto-moto',                 'Housses, diffuseurs, chargeurs',     1),
  ('Entretien auto',          'auto-entretien',              'auto-moto',                 'Huiles, produits nettoyants',        2),
  ('Équipement moto',         'auto-moto-equipement',        'auto-moto',                 'Casques, gants, blousons moto',      3),
  ('Pièces & outils auto',    'auto-pieces-outils',          'auto-moto',                 'Pièces détachées, outillage auto',   4),
  -- Épicerie & quotidien
  ('Boissons',                'epicerie-boissons',           'epicerie-quotidien',         'Eau, jus, sodas, thés',              1),
  ('Snacks',                  'epicerie-snacks',             'epicerie-quotidien',         'Biscuits, chips, confiseries',       2),
  ('Produits d entretien',    'epicerie-entretien',          'epicerie-quotidien',         'Lessive, nettoyants, éponges',       3),
  ('Papier & hygiène maison', 'epicerie-papier-hygiene',     'epicerie-quotidien',         'PQ, essuie-tout, sacs poubelle',     4),
  -- Produits afro & Made in
  ('Cheveux afro',            'afro-cheveux',                'produits-afro-made-in',     'Huiles, shea butter, tissages',      1),
  ('Beauté black skincare',   'afro-blackskincare',          'produits-afro-made-in',     'Soins peau noire, anti-taches',      2),
  ('Pagnes & tenues trad.',   'afro-pagnes',                 'produits-afro-made-in',     'Pagnes, boubous, tenues traditionnelles',3),
  ('Artisanat',               'afro-artisanat',              'produits-afro-made-in',     'Déco, bijoux, sculpture africaine',  4),
  ('Épices & terroir',        'afro-epices-terroir',         'produits-afro-made-in',     'Épices, produits locaux Gabon/Maroc',5),
  -- Bureau & papeterie
  ('Fournitures de bureau',   'bureau-fournitures',          'bureau-papeterie',          'Stylos, agrafes, classeurs',         1),
  ('Impression & accessoires','bureau-impression',           'bureau-papeterie',          'Cartouches, papier, scanners',       2),
  ('Sacs & organisation',     'bureau-sacs-org',             'bureau-papeterie',          'Sacs laptop, trousses, organiseurs', 3),
  -- Animaux
  ('Nourriture animaux',      'animaux-nourriture',          'animaux',                   'Croquettes, pâtées, friandises',     1),
  ('Hygiène animaux',         'animaux-hygiene',             'animaux',                   'Shampoing, antiparasitaires',        2),
  ('Accessoires animaux',     'animaux-accessoires',         'animaux',                   'Laisses, cages, jouets pour animaux',3),
  -- Services
  ('Livraison express',       'services-livraison-express',  'services',                  'Livraison rapide Maroc/Gabon',       1),
  ('Click & Collect',         'services-click-collect',      'services',                  'Retrait en point relais',            2),
  ('Retours & échanges',      'services-retours',            'services',                  'Politique de retour 30 jours',       3)
) AS sub(name, slug, parent_slug, description, sort_order)
JOIN parents ON parents.slug = sub.parent_slug
ON CONFLICT (slug) DO NOTHING;
