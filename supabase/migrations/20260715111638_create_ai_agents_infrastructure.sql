-- ============================================
-- Infrastructure Agents IA WennaShop
-- Tables manquantes uniquement (le reste existe déjà : users, shops, orders, payments, wallet_transactions)
-- ============================================

-- Audit trail partagé entre tous les agents
CREATE TABLE public.agent_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent text NOT NULL CHECK (agent = ANY (ARRAY['devops','marketing','commerce','finance','support','security','analytics','ceo'])),
  action text NOT NULL,
  detail jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_agent_logs_agent ON public.agent_logs(agent, created_at DESC);

-- Logs système / monitoring (DevOps Agent)
CREATE TABLE public.system_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL DEFAULT 'site',
  level text NOT NULL DEFAULT 'error' CHECK (level = ANY (ARRAY['info','warning','error','critical'])),
  message text NOT NULL,
  status_code integer,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_system_logs_created ON public.system_logs(created_at DESC);

-- Base de connaissance (Support Agent)
CREATE TABLE public.base_connaissance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  reponse text NOT NULL,
  categorie text,
  langue text DEFAULT 'fr',
  actif boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Conversations support (Support Agent)
CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id),
  canal text DEFAULT 'whatsapp' CHECK (canal = ANY (ARRAY['whatsapp','email','site'])),
  message_client text NOT NULL,
  reponse_agent text,
  escalade boolean DEFAULT false,
  agent_cible text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_conversations_user ON public.conversations(user_id, created_at DESC);

-- Événements de sécurité applicatifs (Security Agent) — distinct de auth.audit_log_entries
CREATE TABLE public.security_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id),
  event_type text NOT NULL,
  risque text CHECK (risque = ANY (ARRAY['faible','moyen','eleve'])),
  raison text,
  action_prise text,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX idx_security_events_user ON public.security_events(user_id, created_at DESC);

-- Incidents de sécurité (rapports générés)
CREATE TABLE public.incidents_securite (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  security_event_id uuid REFERENCES public.security_events(id),
  gravite text CHECK (gravite = ANY (ARRAY['faible','moyenne','critique'])),
  description text NOT NULL,
  statut text DEFAULT 'ouvert' CHECK (statut = ANY (ARRAY['ouvert','en_cours','resolu'])),
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

-- Synthèses analytiques quotidiennes (Analytics Agent)
CREATE TABLE public.analytics_summary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL DEFAULT CURRENT_DATE,
  ca_jour numeric DEFAULT 0,
  nb_commandes integer DEFAULT 0,
  nb_nouveaux_vendeurs integer DEFAULT 0,
  insights jsonb,
  recommandations jsonb,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX idx_analytics_summary_date ON public.analytics_summary(date);

-- Rapports financiers quotidiens (Finance Agent) — dérivés de payments/wallet_transactions/orders
CREATE TABLE public.rapports_financiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL DEFAULT CURRENT_DATE,
  ca numeric DEFAULT 0,
  commissions numeric DEFAULT 0,
  nb_transactions integer DEFAULT 0,
  anomalie_detectee boolean DEFAULT false,
  resume text,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX idx_rapports_financiers_date ON public.rapports_financiers(date);

-- RLS : activé sur toutes (cohérent avec le reste de la base). Pas de policy = accessible
-- uniquement via service_role (utilisé par n8n), bloqué pour anon/authenticated.
ALTER TABLE public.agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.base_connaissance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents_securite ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_summary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rapports_financiers ENABLE ROW LEVEL SECURITY;
