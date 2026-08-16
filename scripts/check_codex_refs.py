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

# -----------------------------------------------------------------------------
# 2e passe : les noms cités dans les GUIDES rédigés à la main (rotations et
# rangées de talents de `const BUILDS`). Ces noms ne sont pas écrits en dur dans
# le HTML — `cxNames()` en fabrique un `data-codex="auto|Nom"` à l'affichage —
# donc la passe ci-dessus ne les voyait pas, et personne ne voyait un sort périmé.
#
# Incident fondateur (16 août 2026, signalé par un joueur) : la rotation du
# paladin proposait encore Oathbrand, Lightmend, Oath of Iron, Steadfast Aura et
# Reproach, cinq sorts RETIRÉS DU GRIMOIRE à la refonte v0.36. Ils existaient
# toujours dans ABILITIES.json (le jeu les garde pour reconnaître et jeter les
# barres d'action enregistrées), donc rien ne signalait le problème : c'est
# `hiddenFromPlayer` qui fait foi, pas l'existence de la fiche.
HIDDEN = {}          # id -> nom des capacités retirées du grimoire
for entry in load_registry('ABILITIES'):
    if isinstance(entry, dict) and entry.get('hiddenFromPlayer'):
        HIDDEN[entry.get('id')] = entry.get('name')

# Noms de talents et de spés, indexés comme le fait codex-popup.js.
talent_spec_names = set()
try:
    for cls_block in load_registry('TALENTS'):
        for spec in cls_block.get('specs', []):
            talent_spec_names.add(fold(spec.get('name', '')))
        for row in cls_block.get('rows', []):
            for opt in row.get('options', []):
                talent_spec_names.add(fold(opt.get('name', '')))
except FileNotFoundError:
    pass

# `cxNames()` découpe une entrée sur →, / et +, et laisse tomber un « ×N » final.
SPLIT_LABEL = re.compile(r'\s*(?:→|/|\+)\s*')
BUILD_LABEL = re.compile(r'^\s*\["([^"]+)"', re.M)


def auto_resolve(name):
    """L'ordre d'essai de resolve('auto', …) dans codex-popup.js, réduit à ce
    que ce script sait charger. Renvoie (type, ids) ou (None, [])."""
    key = fold(name)
    if key in talent_spec_names:
        return 'talent/spec', []
    for typ in ('ability', 'item', 'set', 'mob', 'npc', 'quest', 'dungeon', 'delve', 'zone'):
        hits = resolve(typ, name)
        if hits:
            return typ, hits
    return None, []


for page in sorted(glob.glob('*.html')):
    with open(page, encoding='utf-8') as f:
        html = f.read()
    block = re.search(r'const BUILDS = \{.*?\n\};', html, re.S)
    if not block:
        continue
    # Les noms que la page réoriente déjà à la main (CX_REF, un nom → un id du
    # jeu) sont résolus par cet id : ils ne passent pas par la devinette de type.
    cx_ref = re.search(r'const CX_REF = \{(.*?)\n\};', html, re.S)
    overrides = {fold(k) for k in re.findall(r'"([^"]+)":\s*"[a-z]+\|', cx_ref.group(1))} if cx_ref else set()
    seen = set()
    for label in BUILD_LABEL.findall(block.group(0)):
        for part in SPLIT_LABEL.split(re.sub(r'\s*×\s*\d+\s*$', '', label)):
            part = part.strip()
            if not part or fold(part) in overrides or (page, fold(part)) in seen:
                continue
            seen.add((page, fold(part)))
            typ, hits = auto_resolve(part)
            if typ is None:
                problems.append((page, f'BUILDS « {part} »', 'introuvable dans la KB'))
            elif typ == 'ability' and all(h in HIDDEN for h in hits):
                problems.append((page, f'BUILDS « {part} »',
                                 'RETIRÉ DU GRIMOIRE (hiddenFromPlayer) — le joueur ne peut plus le lancer'))
            elif len(hits) > 1 and real_conflict(typ, hits):
                problems.append((page, f'BUILDS « {part} »',
                                 'AMBIGU — ajouter une entrée CX_REF vers un id : '
                                 + ', '.join(sorted(x for x in hits if x))))

if problems:
    for page, raw, why in problems:
        label = raw if raw.startswith('BUILDS') else f'data-codex="{raw}"'
        print(f'❌ {page} — {label} : {why}')
    print(f'\n{len(problems)} référence(s) à corriger.')
    sys.exit(1)
print('✓ Toutes les références Codex des pages sont valides et sans ambiguïté.')
