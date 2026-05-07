#!/usr/bin/env python3
"""
WennaShop Agent Local — pont entre Claude et le repo GitHub local
Lance ce script depuis le dossier wennashop.github.io
Usage: python3 wenna-agent.py
"""

import os, subprocess, base64, json
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins="*")

REPO_PATH = os.path.dirname(os.path.abspath(__file__))

def git(cmd):
    result = subprocess.run(
        cmd, cwd=REPO_PATH, capture_output=True, text=True, shell=True
    )
    return result.stdout.strip(), result.stderr.strip(), result.returncode

@app.route("/ping")
def ping():
    branch, _, _ = git("git rev-parse --abbrev-ref HEAD")
    status, _, _ = git("git status --short")
    return jsonify({"ok": True, "branch": branch, "dirty": bool(status.strip())})

@app.route("/files")
def list_files():
    files = []
    for f in os.listdir(REPO_PATH):
        if f.startswith("."):
            continue
        full = os.path.join(REPO_PATH, f)
        if os.path.isfile(full):
            files.append({"name": f, "size": os.path.getsize(full)})
    files.sort(key=lambda x: x["name"].lower())
    return jsonify(files)

@app.route("/read/<path:filename>")
def read_file(filename):
    path = os.path.join(REPO_PATH, filename)
    if not os.path.exists(path):
        return jsonify({"error": "Fichier introuvable"}), 404
    try:
        with open(path, "r", encoding="utf-8") as f:
            content = f.read()
        return jsonify({"filename": filename, "content": content})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/write", methods=["POST"])
def write_file():
    data = request.json
    filename = data.get("filename")
    content = data.get("content")
    commit_msg = data.get("commit", f"fix: update {filename} via Claude agent")
    push = data.get("push", True)

    if not filename or content is None:
        return jsonify({"error": "filename et content requis"}), 400

    path = os.path.join(REPO_PATH, filename)
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    git(f'git add "{filename}"')
    out, err, code = git(f'git commit -m "{commit_msg}"')
    if code != 0 and "nothing to commit" not in out:
        return jsonify({"error": err or out}), 500

    if push:
        out, err, code = git("git push")
        if code != 0:
            return jsonify({"error": "Push échoué: " + err}), 500

    return jsonify({"ok": True, "committed": commit_msg, "pushed": push})

@app.route("/patch", methods=["POST"])
def patch_file():
    """Remplacement chirurgical : old_str -> new_str dans un fichier"""
    data = request.json
    filename = data.get("filename")
    old_str = data.get("old")
    new_str = data.get("new")
    commit_msg = data.get("commit", f"fix: patch {filename} via Claude agent")
    push = data.get("push", True)

    if not all([filename, old_str is not None, new_str is not None]):
        return jsonify({"error": "filename, old et new requis"}), 400

    path = os.path.join(REPO_PATH, filename)
    if not os.path.exists(path):
        return jsonify({"error": "Fichier introuvable"}), 404

    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    if old_str not in content:
        return jsonify({"error": "Texte introuvable dans le fichier"}), 400

    count = content.count(old_str)
    new_content = content.replace(old_str, new_str, 1)

    with open(path, "w", encoding="utf-8") as f:
        f.write(new_content)

    git(f'git add "{filename}"')
    out, err, code = git(f'git commit -m "{commit_msg}"')
    if code != 0 and "nothing to commit" not in out:
        return jsonify({"error": err or out}), 500

    if push:
        out, err, code = git("git push")
        if code != 0:
            return jsonify({"error": "Push échoué: " + err}), 500

    return jsonify({"ok": True, "occurrences": count, "committed": commit_msg, "pushed": push})

@app.route("/status")
def status():
    out, _, _ = git("git log --oneline -5")
    dirty, _, _ = git("git status --short")
    return jsonify({"log": out, "status": dirty})

if __name__ == "__main__":
    print("\n🟢 WennaShop Agent démarré")
    print(f"📁 Repo: {REPO_PATH}")
    print("🔗 Écoute sur http://localhost:5678\n")
    app.run(port=5678, debug=False)
