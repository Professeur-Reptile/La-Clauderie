#!/usr/bin/env python3
# -----------------------------------------------------------------------------
# Vérifie la couverture d'assets/codex-fr.json — les traductions FRANÇAISES
# MAISON des descriptions affichées par les fiches Codex (codex-popup.js).
#
# Pourquoi « maison » : la traduction officielle du jeu a été jugée trop
# inégale (décision d'août 2026, demande du guilde-maître) — seuls les NOMS
# officiels fr_FR sont repris (via data/I18N_FR.json de la KB) ; les
# descriptions sont traduites par la Routine éditoriale, ici.
#
# Usage :  python3 scripts/check_codex_fr.py [dossier data de la KB]
#   - liste les clés MANQUANTES (nouveau contenu anglais à traduire),
#     PÉRIMÉES (le texte anglais a changé depuis la traduction — empreinte
#     _src) et ORPHELINES (le contenu n'existe plus) ;
#   - code retour 1 s'il y a du travail, 0 sinon.
#
# À lancer à chaque MAJ du jeu (procédure ⚡ de CLAUDE.md). Pour traduire :
# reprendre la charte ci-dessous, puis ajouter la clé dans codex-fr.json ET
# son empreinte dans _src (sha1 du texte anglais, 8 premiers hex).
#
# CHARTE DE TRADUCTION (résumé) : naturelle (pas mot à mot), tutoiement,
# chiffres/durées exacts (« sec »→« s », « yd »→« m »), noms propres de
# sorts/objets/monstres laissés EN ANGLAIS, terminologie du site (dégâts,
# soins, menace, recharge, incantation, mêlée, points de combo, hâte,
# esquive, parade, camouflage, provocation, PV max, hors GCD…).
# -----------------------------------------------------------------------------
import hashlib
import json
import sys
import unicodedata

DATA = sys.argv[1] if len(sys.argv) > 1 else '../wocc-knowledge-base/data'
FR_PATH = 'assets/codex-fr.json'


def fold(s):
    s = unicodedata.normalize('NFD', str(s))
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return s.replace('’', "'").replace('‘', "'").lower().strip()


def sha(text):
    return hashlib.sha1(text.encode('utf-8')).hexdigest()[:8]


def load(name):
    with open(f'{DATA}/{name}.json', encoding='utf-8') as f:
        return json.load(f)


def as_list(reg):
    return list(reg.values()) if isinstance(reg, dict) else list(reg or [])


def expected():
    """Reconstruit le corpus anglais à traduire — mêmes clés que codex-fr.json.
    Une entrée par texte AFFICHÉ par codex-popup.js : descriptions de sorts,
    de talents (nœuds + options), de spés (+ maîtrise), bonus de panoplies."""
    out = {}  # clé plate -> texte anglais
    for a in as_list(load('ABILITIES')):
        if a.get('description'):
            out[f"ability\t{a['id']}"] = a['description']
    for cls, tree in load('TALENTS').items():
        for node in tree.get('nodes') or []:
            if node.get('description'):
                out[f"talent\t{cls}/{node.get('id') or fold(node['name'])}"] = node['description']
            for ch in node.get('choices') or []:
                if ch.get('description'):
                    out[f"talent\t{cls}/{ch.get('id') or fold(ch['name'])}"] = ch['description']
        for row in tree.get('rows') or []:
            for ch in row.get('options') or []:
                if ch.get('description'):
                    out[f"talent\t{cls}/{ch.get('id') or fold(ch['name'])}"] = ch['description']
        for s in tree.get('specs') or []:
            if s.get('description'):
                out[f"spec\t{cls}/{s['id']}\tdescription"] = s['description']
            if (s.get('mastery') or {}).get('description'):
                out[f"spec\t{cls}/{s['id']}\tmastery"] = s['mastery']['description']
    for s in as_list(load('ITEM_SETS')):
        for b in s.get('bonuses') or []:
            txt = b.get('text') or b.get('description')
            if txt:
                out[f"set\t{s['id']}\t{b['pieces']}"] = txt
    return out


def flat_fr(fr):
    out = {}
    for k, v in (fr.get('ability') or {}).items():
        out[f'ability\t{k}'] = v
    for k, v in (fr.get('talent') or {}).items():
        out[f'talent\t{k}'] = v
    for k, v in (fr.get('spec') or {}).items():
        for kk, vv in v.items():
            out[f'spec\t{k}\t{kk}'] = vv
    for k, v in (fr.get('set') or {}).items():
        for kk, vv in v.items():
            out[f'set\t{k}\t{kk}'] = vv
    return out


def main():
    want = expected()
    try:
        with open(FR_PATH, encoding='utf-8') as f:
            fr = json.load(f)
    except FileNotFoundError:
        fr = {}
    have = flat_fr(fr)
    src = fr.get('_src') or {}

    missing = sorted(k for k in want if k not in have)
    stale = sorted(k for k in want if k in have and src.get(k) and src[k] != sha(want[k]))
    unstamped = sorted(k for k in want if k in have and not src.get(k))
    orphans = sorted(k for k in have if k not in want)

    if missing:
        print(f'❌ {len(missing)} description(s) SANS traduction :')
        for k in missing:
            print(f'  - {k}\n      EN : {want[k][:120]}')
    if stale:
        print(f'⚠️  {len(stale)} traduction(s) PÉRIMÉE(S) (le texte anglais a changé) :')
        for k in stale:
            print(f'  - {k}\n      EN actuel : {want[k][:120]}')
    if unstamped:
        print(f'ℹ️  {len(unstamped)} traduction(s) sans empreinte _src (ajouter sha1[:8] du texte EN).')
    if orphans:
        print(f'ℹ️  {len(orphans)} clé(s) orpheline(s) (contenu disparu du jeu) — à nettoyer un jour : '
              + ', '.join(orphans[:10]) + ('…' if len(orphans) > 10 else ''))
    if not (missing or stale):
        print(f'✓ codex-fr.json couvre les {len(want)} descriptions affichées par les fiches.')
    sys.exit(1 if (missing or stale) else 0)


if __name__ == '__main__':
    main()
