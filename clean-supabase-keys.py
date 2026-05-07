#!/usr/bin/env python3
"""
WennaShop — Nettoyage chirurgical des clés Supabase dupliquées
Remplace les createClient inline par window.db (déjà défini dans Supabase.config.js)
"""
import os, subprocess

REPO = os.path.dirname(os.path.abspath(__file__))

PATCHES = {
    "admin_panel.html": [
        (
            "const SB_URL  = 'https://aakxoydznmybstfozjte.supabase.co'\nconst SB_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFha3hveWR6bm15YnN0Zm96anRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MDQxMjAsImV4cCI6MjA5MTE4MDEyMH0.ncjxAvqVrxW75QJ4zcu0StOJsNtEZfY1SD48nRyJCs0'\nconst db = supabase.createClient(SB_URL, SB_ANON)",
            "const db = window.db"
        )
    ],
    "compte.html": [
        (
            "const SUPABASE_URL = 'https://aakxoydznmybstfozjte.supabase.co'\nconst SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFha3hveWR6bm15YnN0Zm96anRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MDQxMjAsImV4cCI6MjA5MTE4MDEyMH0.ncjxAvqVrxW75QJ4zcu0StOJsNtEZfY1SD48nRyJCs0'\nconst db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)",
            "const db = window.db"
        )
    ],
    "index.html": [
        (
            "const SUPABASE_URL  = 'https://aakxoydznmybstfozjte.supabase.co'\nconst SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFha3hveWR6bm15YnN0Zm96anRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MDQxMjAsImV4cCI6MjA5MTE4MDEyMH0.ncjxAvqVrxW75QJ4zcu0StOJsNtEZfY1SD48nRyJCs0'",
            "const SUPABASE_URL  = window.WENNA.supabaseUrl\n  const SUPABASE_ANON = window.WENNA.supabaseKey"
        ),
        (
            "try { db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON) }",
            "try { db = window.db }"
        )
    ],
    "paiement.html": [
        (
            "const SUPABASE_URL  = 'https://aakxoydznmybstfozjte.supabase.co'\n  const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFha3hveWR6bm15YnN0Zm96anRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MDQxMjAsImV4cCI6MjA5MTE4MDEyMH0.ncjxAvqVrxW75QJ4zcu0StOJsNtEZfY1SD48nRyJCs0'",
            ""
        ),
        (
            "function getSb() { return window.db || window._wennaSb || (window._wennaSb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON)) }",
            "function getSb() { return window.db }"
        )
    ],
    "panier.html": [
        (
            "const { createClient } = supabase\nconst sb = createClient(\n  'https://aakxoydznmybstfozjte.supabase.co',\n  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFha3hveWR6bm15YnN0Zm96anRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MDQxMjAsImV4cCI6MjA5MTE4MDEyMH0.ncjxAvqVrxW75QJ4zcu0StOJsNtEZfY1SD48nRyJCs0'\n)",
            "const sb = window.db"
        )
    ],
    "recherche.html": [
        (
            "const sb = supabase.createClient(\n  'https://aakxoydznmybstfozjte.supabase.co',\n  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFha3hveWR6bm15YnN0Zm96anRlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2MDQxMjAsImV4cCI6MjA5MTE4MDEyMH0.ncjxAvqVrxW75QJ4zcu0StOJsNtEZfY1SD48nRyJCs0'\n)",
            "const sb = window.db"
        )
    ],
}

def patch(filename, patches):
    path = os.path.join(REPO, filename)
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    original = content
    for old, new in patches:
        if old in content:
            content = content.replace(old, new, 1)
            print(f"  ✅ {filename} — patch appliqué")
        else:
            print(f"  ⚠️  {filename} — texte introuvable (déjà patché?)")
    if content != original:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
    return content != original

def git(cmd):
    r = subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, shell=True)
    return r.stdout.strip(), r.stderr.strip(), r.returncode

print("\n🔒 WennaShop — Nettoyage clés Supabase\n")
modified = []
for filename, patches in PATCHES.items():
    if patch(filename, patches):
        modified.append(filename)

if modified:
    files = " ".join(f'"{f}"' for f in modified)
    git(f"git add {files}")
    out, err, code = git('git commit -m "security: remove hardcoded Supabase keys, use window.db singleton"')
    print(f"\n📦 Commit: {out or err}")
    out, err, code = git("git push")
    if code == 0:
        print("🚀 Push OK — Netlify redéploie")
    else:
        print(f"❌ Push échoué: {err}")
else:
    print("Aucune modification nécessaire.")

print("\nDone.\n")
