#!/usr/bin/env python3
# -----------------------------------------------------------------------------
# Vérifie la syntaxe de TOUS les <script> embarqués des pages du site.
#
# Né d'un incident (4 août 2026) : une apostrophe droite (') insérée dans une
# chaîne JS délimitée par des apostrophes simples de metiers.html a cassé tout
# le script de rendu — onglet Métiers vide en production, signalé par un
# guildé. Les chaînes françaises du site utilisent l'apostrophe typographique
# (’) précisément pour éviter ça : ce script attrape l'erreur avant le push.
#
# Usage :  python3 scripts/check_inline_js.py   (code retour 1 si erreur)
# À lancer avant tout push qui touche une page HTML (voir CLAUDE.md).
# -----------------------------------------------------------------------------
import glob
import re
import subprocess
import sys
import tempfile
import os

PAGES = sorted(glob.glob('*.html') + glob.glob('notes/*.html'))
bad = 0
for page in PAGES:
    with open(page, encoding='utf-8') as f:
        html = f.read()
    # Seuls les scripts inline (pas src=) contiennent du code à vérifier.
    for i, sc in enumerate(re.findall(r'<script>(.*?)</script>', html, re.S)):
        with tempfile.NamedTemporaryFile('w', suffix='.js', delete=False, encoding='utf-8') as f:
            f.write(sc)
            path = f.name
        r = subprocess.run(['node', '--check', path], capture_output=True, text=True)
        os.unlink(path)
        if r.returncode:
            bad += 1
            first = r.stderr.strip().splitlines()
            print(f'❌ {page} — script inline #{i} : erreur de syntaxe')
            print('   ' + (first[1][:160] if len(first) > 1 else first[0][:160]))

if bad:
    print(f'\n{bad} script(s) cassé(s) — NE PAS pousser en l\'état.')
    sys.exit(1)
print(f'✓ {len(PAGES)} pages vérifiées, tous les scripts embarqués sont valides.')
