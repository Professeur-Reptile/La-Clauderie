#!/usr/bin/env python3
# -----------------------------------------------------------------------------
# Vérifie les références Codex (data-codex="type|réf") des pages du site :
#   1. la référence existe bien dans les données de la knowledge base ;
#   2. elle n'est pas AMBIGUË — le jeu réutilise des noms d'affichage anglais
#      pour des entités différentes (deux sorts « Aether Surge » : le builder
#      arcane_surge et le buff arcane_power). Une référence par nom pointe
#      alors n'importe laquelle des deux : il faut viser l'ID du jeu.
#
# Incident fondateur (4 août 2026) : le site affichait « Aether Surge (Pouvoir
# des Arcanes) » — le nom français de l'AUTRE sort — dans la rotation du Mage
# soigneur. Les homonymes normal/héroïque d'un même objet ne sont PAS un
# problème (même nom français) : seuls les vrais conflits sont signalés.
#
# Usage :  python3 scripts/check_codex_refs.py [dossier data de la KB]
# À lancer avec check_inline_js.py avant un push touchant des pages HTML.
# -----------------------------------------------------------------------------
import collections
import glob
import json
import re
import sys
import unicodedata

DATA = sys.argv[1] if len(sys.argv) > 1 else '../wocc-knowledge-base/data'
REGISTRY = {
    'item': 'ITEMS', 'mob': 'MOBS', 'npc': 'NPCS', 'quest': 'QUESTS',
    'zone': 'ZONES', 'dungeon': 'DUNGEONS', 'delve': 'DELVES',
    'set': 'ITEM_SETS', 'ability': 'ABILITIES',
}


def fold(s):
    s = unicodedata.normalize('NFD', str(s))
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return s.replace('’', "'").replace('‘', "'").lower().strip()


def load_registry(name):
    with open(f'{DATA}/{name}.json', encoding='utf-8') as f:
        data = json.load(f)
    return list(data.values()) if isinstance(data, dict) else list(data)


# Par type : les ids connus, et les noms anglais repliés → liste d'ids.
ids, by_name = {}, {}
for typ, reg in REGISTRY.items():
    entries = [e for e in load_registry(reg) if isinstance(e, dict)]
    ids[typ] = {e.get('id') for e in entries}
    g = collections.defaultdict(list)
    for e in entries:
        label = e.get('name') or e.get('title')
        if label:
            g[fold(label)].append(e.get('id'))
    by_name[typ] = g

# Deux ids qui partagent un nom anglais ET un nom français (variantes
# normal/héroïque) ne gênent personne : l'annotation reste juste.
fr = {}
try:
    with open(f'{DATA}/I18N_FR.json', encoding='utf-8') as f:
        fr = json.load(f)
except FileNotFoundError:
    pass


def real_conflict(typ, ids_):
    names = {(fr.get(typ) or {}).get(i) for i in ids_}
    names.discard(None)
    return len(names) > 1


def resolve(typ, ref):
    """Même résolution que codex-popup.js : id, puis nom exact replié, puis
    repli par préfixe/sous-chaîne quand il ne ramène qu'un seul candidat."""
    if ref in ids[typ]:
        return [ref]
    key = fold(ref)
    hits = by_name[typ].get(key)
    if hits:
        return hits
    loose = [i for name, group in by_name[typ].items()
             if name.startswith(key) or key in name for i in group]
    return loose


problems = []
# Les apostrophes sont fréquentes dans les noms du jeu (Gatherer's Cache) :
# on capture jusqu'au guillemet de FERMETURE réel, pas jusqu'à la première
# apostrophe. Les attributs construits en JS (${…}) sont ignorés.
PATTERN = re.compile(r'data-codex="([^"]+)"|data-codex=\'([^\']+)\'')
for page in sorted(glob.glob('*.html') + glob.glob('notes/*.html')):
    with open(page, encoding='utf-8') as f:
        html = f.read()
    for m in PATTERN.finditer(html):
        raw = m.group(1) or m.group(2)
        if '|' not in raw or '${' in raw:
            continue
        typ, ref = (p.strip() for p in raw.split('|', 1))
        # `term` (glossaire maison) et `talent`/`spec` (indexés à part par
        # codex-popup.js) ne passent pas par ces registres.
        if typ not in REGISTRY:
            continue
        hits = resolve(typ, ref)
        if not hits:
            problems.append((page, raw, 'introuvable dans la KB'))
        elif len(hits) > 1 and real_conflict(typ, hits):
            problems.append((page, raw, 'AMBIGU — viser un id : ' + ', '.join(sorted(x for x in hits if x))))

if problems:
    for page, raw, why in problems:
        print(f'❌ {page} — data-codex="{raw}" : {why}')
    print(f'\n{len(problems)} référence(s) à corriger.')
    sys.exit(1)
print('✓ Toutes les références Codex des pages sont valides et sans ambiguïté.')
