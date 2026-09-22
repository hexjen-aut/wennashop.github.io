ALTER TABLE public.users ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('homme','femme','autre','non_precise')) DEFAULT 'non_precise';
