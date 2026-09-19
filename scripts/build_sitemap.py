#!/usr/bin/env python3
# -----------------------------------------------------------------------------
# Génère le sitemap.xml du site — appelé par deploy.yml à chaque publication,
# APRES l'assemblage de _site/ : le plan est toujours celui du site publié,
# jamais un fichier du dépôt qui vieillit.
#
#   python3 scripts/build_sitemap.py _site
#
# Contenu : les pages de la racine (hors admin.html, en noindex), puis toutes
# les pages de notes (fr + en) avec leur date de version. Le Codex (site/)
# n'est pas listé : il est servi sous /codex/ avec ses propres liens internes
# et Google le découvre en suivant la navigation.
# -----------------------------------------------------------------------------
import json
import sys
from pathlib import Path

BASE = 'https://laclauderie.fr'

root = Path(sys.argv[1] if len(sys.argv) > 1 else '_site')

# Pages de la racine, dans l'ordre d'importance. admin.html : noindex, exclu.
STATIC = [
    ('index.html', '1.0', 'weekly'),
    ('bis.html', '0.9', 'weekly'),
    ('dps.html', '0.8', 'weekly'),
    ('metiers.html', '0.8', 'weekly'),
    ('pvp.html', '0.8', 'weekly'),
    ('failles.html', '0.8', 'monthly'),
    ('montures.html', '0.8', 'monthly'),
    ('patch-notes.html', '0.9', 'daily'),
    ('a-venir.html', '0.7', 'daily'),
    ('guilde.html', '0.5', 'daily'),
    ('woc.html', '0.5', 'monthly'),
]

notes_dates = {}
try:
    for v in json.load(open('patch-notes.json', encoding='utf-8'))['versions']:
        notes_dates[f"notes/{v['version']}.html"] = v['date']
except Exception:
    pass  # pas grave : les notes partiront sans lastmod

entries = []
for name, prio, freq in STATIC:
    if (root / name).exists():
        entries.append((name, None, prio, freq))

for path in sorted((root / 'notes').glob('*.html')):
    rel = f'notes/{path.name}'
    entries.append((rel, notes_dates.get(rel), '0.6', 'yearly'))

out = ['<?xml version="1.0" encoding="UTF-8"?>',
       '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
for name, lastmod, prio, freq in entries:
    # L'accueil se déclare à la racine : c'est l'URL canonique que le .htaccess
    # et les liens externes utilisent, pas « /index.html ».
    loc = BASE + '/' if name == 'index.html' else f'{BASE}/{name}'
    out.append(' <url>')
    out.append(f'  <loc>{loc}</loc>')
    if lastmod:
        out.append(f'  <lastmod>{lastmod}</lastmod>')
    out.append(f'  <changefreq>{freq}</changefreq>')
    out.append(f'  <priority>{prio}</priority>')
    out.append(' </url>')
out.append('</urlset>')
sys.stdout.write('\n'.join(out) + '\n')
