-- Produits Myria
CREATE TABLE IF NOT EXISTS myria_produits (
  id BIGSERIAL PRIMARY KEY,
  nom TEXT NOT NULL,
  marque TEXT NOT NULL,
  genre TEXT DEFAULT 'Unisexe',
  format TEXT NOT NULL,
  prix_maroc NUMERIC(10,2) DEFAULT 0,
  prix_gabon NUMERIC(10,2) DEFAULT 0,
  disponible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Commandes Myria
CREATE TABLE IF NOT EXISTS myria_commandes (
  id BIGSERIAL PRIMARY KEY,
  client TEXT NOT NULL,
  parfum TEXT NOT NULL,
  format TEXT NOT NULL,
  prix NUMERIC(10,2) DEFAULT 0,
  statut TEXT DEFAULT 'en_attente', -- en_attente, paye, envoye, livre
  date DATE DEFAULT CURRENT_DATE,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Envois Myria
CREATE TABLE IF NOT EXISTS myria_envois (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  colis INT DEFAULT 1,
  cout NUMERIC(10,2) DEFAULT 100,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS désactivé pour usage interne
ALTER TABLE myria_produits DISABLE ROW LEVEL SECURITY;
ALTER TABLE myria_commandes DISABLE ROW LEVEL SECURITY;
ALTER TABLE myria_envois DISABLE ROW LEVEL SECURITY;
