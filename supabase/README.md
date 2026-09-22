# Migrations Supabase

Ce dossier contient l'historique complet des migrations SQL appliquées au
projet Supabase `aakxoydznmybstfozjte`, exporté depuis
`supabase_migrations.schema_migrations` le 22/09/2026 (114 migrations,
d'avril à septembre 2026).

Jusqu'ici ces migrations vivaient uniquement dans Supabase, sans trace dans
le dépôt Git — ce dossier corrige ça.

## Appliquer une nouvelle migration

Avec la CLI Supabase (`npm install -g supabase`) :

```bash
supabase link --project-ref aakxoydznmybstfozjte
supabase migration new nom_de_la_migration
# éditer le fichier créé dans supabase/migrations/
supabase db push
```

Sans la CLI, une migration appliquée directement via l'outil MCP Supabase
(`apply_migration`) doit aussi être copiée ici manuellement, au format
`<timestamp>_<nom>.sql`, pour rester versionnée.
