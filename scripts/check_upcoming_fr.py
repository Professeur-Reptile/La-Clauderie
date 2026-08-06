#!/usr/bin/env python3
"""Liste les libellés de la page « À venir » qui n'ont pas encore leur
traduction française dans assets/upcoming-fr.json.

    python3 scripts/check_upcoming_fr.py

Sort en code 1 s'il en manque, pour servir de rappel (non bloquant) en CI.

CHARTE — on ne TRADUIT pas, on RÉÉCRIT (correction du 6 août 2026 : une
première passe avait produit du jargon de développeur en français, que ni les
joueurs ni le chef de guilde ne comprenaient) :
  - la phrase doit dire ce que le joueur va CONSTATER EN JEU. Test : « est-ce
    qu'un membre de la guilde qui n'a jamais lu une ligne de code comprend ce
    que ça change pour lui ? » Si non, c'est à réécrire ;
  - partir de l'effet, pas du mécanisme. « Scale mastery and talent damage
    percent over the whole hit » ne devient pas « la maîtrise s'applique à la
    frappe entière » (exact mais creux) : « tes dégâts montent, les bonus
    s'appliquent désormais à tout le coup » ;
  - si un changement n'a AUCUN effet visible pour un joueur (plomberie
    serveur, dette technique, limitation de débit d'une API), mettre `null` :
    la ligne est masquée. Mieux vaut une liste plus courte qu'une ligne que
    personne ne comprend ;
  - ne jamais recopier une traduction automatique : les messages sont du
    jargon de développeur, une traduction littérale ne veut rien dire ;
  - les noms propres du jeu (zones, sorts, monstres) restent tels quels s'ils
    n'ont pas de nom français officiel — la KB en tient la liste
    (data/I18N_FR.json) ;
  - apostrophes typographiques (’), pas droites ;
  - une phrase, pas un paragraphe : la page est une liste, pas un article.

La clé est l'empreinte sha1[:8] du texte anglais, calculée par
build_upcoming.py et publiée dans upcoming.json (champ « h »). Quand les
développeurs reformulent leur message, l'empreinte change et la ligne
réapparaît ici : c'est voulu, une traduction périmée serait pire que pas de
traduction du tout.
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def main():
    up = ROOT / "upcoming.json"
    fr = ROOT / "assets" / "upcoming-fr.json"
    if not up.exists():
        print("upcoming.json absent — rien à traduire.")
        return 0

    data = json.loads(up.read_text())
    if not data.get("version"):
        print("Aucune version en préparation — rien à traduire.")
        return 0

    known = json.loads(fr.read_text()) if fr.exists() else {}
    items = [i for s in data.get("sections", []) for i in s.get("items", [])]
    # Une entrée à null est une DÉCISION éditoriale (« invisible pour un
    # joueur, on la masque »), pas un oubli : elle ne doit pas revenir ici.
    missing = [i for i in items if i.get("h") and i["h"] not in known]

    total = len(items)
    print(f"{data['version']} — {total} libellés, {total - len(missing)} traduits.")
    if not missing:
        print("✓ Tout est traduit.")
        return 0

    print(f"\n{len(missing)} à traduire dans assets/upcoming-fr.json :\n")
    for i in missing:
        print(f'  "{i["h"]}": "",')
        print(f"      ← {i['text']}")
    print("\n(charte de traduction : en-tête de ce script)")
    return 1


if __name__ == "__main__":
    sys.exit(main())
