#!/usr/bin/env python3
"""Prépare la page « À venir » à partir de la branche de release du jeu.

Le jeu prépare chaque version sur une branche `release/vX.Y.Z` avant de la
taguer. Ce script lit les commits déjà mergés sur cette branche et les range
dans les SIX MÊMES rubriques que le bandeau des notes de version, pour que le
lecteur retrouve ses repères entre « ce qui est sorti » et « ce qui arrive ».

Entrée : un dépôt du jeu où les branches de release sont fetchées.
Sortie : upcoming.json sur la sortie standard.

    python3 scripts/build_upcoming.py <dépôt-du-jeu> <tag-de-base> <branche> [branche2 …] > upcoming.json

Le jeu mène parfois DEUX chantiers en parallèle (un correctif v0.35.1 et la
v0.36.0, constaté le 7 août 2026) : passer toutes les branches au-dessus du
dernier tag, de la plus basse à la plus haute. Le JSON garde à sa racine les
champs de la PREMIÈRE branche (la prochaine à sortir — compatibilité avec la
page et les décisions du workflow), et liste chaque chantier dans `versions`.

Rien n'est rédigé ici, et la liste produite N'EST PLUS AFFICHÉE (retirée le
6 août 2026 : le site est fait pour les joueurs, pas pour les développeurs).
La page ne lit plus que trois choses dans ce JSON : le numéro de version, la
fraîcheur du relevé (last_commit) et le compteur de commits qui fait expirer
la partie rédigée. Les sections classées restent produites comme matière
première pour la Routine de réécriture et pour le débogage.
"""
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone

from pick_release_branches import version_key

# Les six rubriques, dans l'ordre imposé du bandeau (voir CLAUDE.md).
SECTIONS = [
    ("classes",  "⚔️", "Classes & sorts",           "Classes & spells"),
    ("metiers",  "🔨", "Métiers & récolte",          "Professions & gathering"),
    ("donjons",  "🐉", "Donjons, failles & boss",    "Dungeons, rifts & bosses"),
    ("monde",    "🗺️", "Monde & quêtes",             "World & quests"),
    ("guilde",   "🏰", "Guilde & social",            "Guild & social"),
    ("confort",  "⚙️", "Confort & technique",        "Comfort & technical"),
]

# Un changement de classe n'a pas de portée « class » : il arrive sous `sim` ou
# `content`. Le sujet est donc la meilleure source, la portée ne sert que de
# repli. Ordre = priorité : la première rubrique qui matche l'emporte — les
# métiers passent avant les classes, « craft » étant plus sûr que « cast »
# quand les deux apparaissent (« craft cast strip » est un écran de métier).
KEYWORDS = [
    ("metiers", r"\b(craft|crafting|enchant|profession|gather|harvest|forage|mining|smelt|"
                r"fishing|fish|cook|recipe|reagent|material|tool|commission)\b"),
    ("classes", r"(?<![-\w])(talent|mastery|spec|spell|cast|aura|buff|debuff|cooldown|rage|mana|energy|"
                r"crit|damage percent|auto-attack|rotation|warrior|mage|rogue|priest|paladin|"
                r"druid|hunter|warlock|shaman|shadowform|moonkin|metamorph|barrier|fury)(?![-\w])"),
    ("donjons", r"\b(rift|dungeon|delve|raid|boss|elite|encounter|heroic|lockout|"
                r"dungeon finder|nythraxis)\b"),
    ("monde",   r"\b(quest|zone|world map|mob|spawn|npc|vendor|camp|deed|chronicle|"
                r"galecrest|frostveil|drakelands|thornpeak|wildheart|starter)\b"),
    ("guilde",  r"\b(guild|chat|party|group|friend|social|whisper|moderation|mute|report|"
                r"spectate|leaderboard|high scores|discord|community)\b"),
]

# Portée → rubrique, quand le sujet ne dit rien de net.
SCOPE_FALLBACK = {
    "professions": "metiers", "fishing": "metiers", "items": "monde", "content": "monde",
    "bot": "guilde", "server": "confort", "ui": "confort", "render": "confort",
    "styles": "confort", "input": "confort", "android": "confort", "guide": "confort",
    "sim": "confort", "net": "confort", "balance": "classes",
}

# Ce qui n'intéresse pas un joueur : outillage, tests, dépendances, coulisses.
SKIP_TYPES = {"test", "chore", "docs", "build", "refactor", "style"}
SKIP_SCOPES = {"ci", "gate", "deps", "repin", "screenshots", "audit", "parse",
               "editor", "admin", "release", "assets", "bench"}

CONVENTIONAL = re.compile(r"^(?P<type>[a-z]+)(?:\((?P<scope>[^)]*)\))?(?P<bang>!?):\s*(?P<subject>.+)$")
PR_SUFFIX = re.compile(r"\s*\(#\d+\)\s*$")


def git(repo, *args):
    return subprocess.run(["git", "-C", repo, *args], capture_output=True, text=True,
                          check=False).stdout.strip()


def classify(scope, subject):
    hay = f"{scope} {subject}".lower()
    for key, pattern in KEYWORDS:
        if re.search(pattern, hay):
            return key
    return SCOPE_FALLBACK.get(scope, "confort")


def analyse(repo, base_tag, branch):
    raw = git(repo, "log", "--format=%H%x1f%aI%x1f%s", f"{branch}", f"^{base_tag}")
    lines = [l for l in raw.splitlines() if l.strip()]

    buckets = {key: [] for key, *_ in SECTIONS}
    total = 0
    for line in lines:
        parts = line.split("\x1f")
        if len(parts) != 3:
            continue
        _sha, when, subject = parts
        total += 1
        m = CONVENTIONAL.match(subject)
        if not m:
            continue
        typ = m.group("type")
        scope = (m.group("scope") or "").strip()
        if typ in SKIP_TYPES or scope in SKIP_SCOPES:
            continue
        text = m.group("subject")
        while True:
            stripped = PR_SUFFIX.sub("", text)
            if stripped == text:
                break
            text = stripped
        text = text.strip()
        if not text:
            continue
        text = text[0].upper() + text[1:]
        buckets[classify(scope, text)].append({
            # Empreinte du texte anglais. Servait de clé au dispositif de
            # traduction ligne à ligne, retiré le 6 août 2026 avec la liste ;
            # conservée car stable et utile pour dédupliquer si besoin.
            "h": hashlib.sha1(text.encode("utf-8")).hexdigest()[:8],
            "kind": "feat" if typ == "feat" else ("perf" if typ == "perf" else "fix"),
            "scope": scope,
            "text": text,
            "date": when[:10],
        })

    # Les nouveautés d'abord, puis les correctifs ; du plus récent au plus ancien.
    order = {"feat": 0, "perf": 1, "fix": 2}
    for items in buckets.values():
        items.sort(key=lambda i: (order[i["kind"]], i["date"]), reverse=False)
        items.reverse()
        items.sort(key=lambda i: order[i["kind"]])

    # La version déclarée par le jeu : tant qu'elle n'est pas montée à la
    # prochaine, la sortie n'est pas imminente — c'est le tout dernier geste
    # avant le tag.
    declared = ""
    pkg = git(repo, "show", f"{branch}:package.json")
    if pkg:
        try:
            declared = json.load(__import__("io").StringIO(pkg)).get("version", "")
        except Exception:
            declared = ""
    upcoming = branch.split("/")[-1]
    imminent = bool(declared) and f"v{declared}" == upcoming

    last = git(repo, "log", "-1", "--format=%aI", branch)
    shown = sum(len(v) for v in buckets.values())
    return {
        "version": upcoming,
        "branch": branch,
        "declared_version": declared,
        "imminent": imminent,
        "commits": total,
        "shown": shown,
        "last_commit": last,
        "sections": [
            {"key": key, "icon": icon, "fr": fr, "en": en, "items": buckets[key]}
            for key, icon, fr, en in SECTIONS
        ],
    }


def main():
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    repo, base_tag, branches = sys.argv[1], sys.argv[2], sys.argv[3:]

    versions = [analyse(repo, base_tag, b) for b in branches]

    # Une version, UN chantier. Le jeu porte chaque version sur PLUSIEURS
    # branches à la fois — `release/vX.Y.Z` et une ou deux enveloppes
    # `ossbrain-release/*` qui y seront mergées (voir l'en-tête de
    # pick_release_branches.py) — et toutes nous arrivent, parce qu'aucune ne
    # devance les autres en permanence : l'enveloppe accumule d'abord, la
    # release la rattrape quand la PR passe, puis une nouvelle enveloppe
    # repart devant.
    #
    # Le regroupement se fait sur le NUMÉRO ANALYSÉ, pas sur le nom de la
    # branche : le 18 août 2026, le jeu a ouvert `ossbrain-release/v0.39` à
    # côté de `release/v0.39.0`. Les deux préparent la même version, mais
    # comparés comme des chaînes ils ne se ressemblent pas, et la page a
    # affiché DEUX bandeaux pour un seul chantier.
    par_cle = {}
    for v in versions:
        par_cle.setdefault(version_key(v["version"]) or (10**9, 0, 0), []).append(v)

    versions = []
    for groupe in par_cle.values():
        # Le contenu vient de la branche la plus avancée : ses rubriques sont
        # les plus complètes, et son nombre de commits est la taille réelle du
        # chantier.
        base = max(groupe, key=lambda v: v["commits"])
        # Le NOM affiché est le plus précis du groupe : `v0.39` et `v0.39.0`
        # décrivent la même version, mais c'est `v0.39.0` qui sera taguée — et
        # c'est ce numéro que l'éditorial et patch-notes.json emploient.
        base["version"] = max(
            (v["version"] for v in groupe), key=lambda s: (s.count("."), len(s))
        )
        # Le numéro est réputé FIXÉ dès qu'UNE branche de la version l'a inscrit
        # dans son package.json : c'est le geste qui précède la publication, et
        # il n'a pas à être répété sur l'enveloppe pour compter.
        declarante = next((v for v in groupe if v["imminent"]), None)
        if declarante is not None:
            base["imminent"] = True
            base["declared_version"] = declarante["declared_version"]
        versions.append(base)

    # De la plus basse à la plus haute — la première est la prochaine à sortir.
    # Un nom sans numéro exploitable passe en fin de liste plutôt que de faire
    # planter le script (voir l'en-tête de pick_release_branches.py).
    versions.sort(key=lambda v: version_key(v["version"]) or (10**9, 0, 0))

    out = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "base_tag": base_tag,
        # Compatibilité : la racine décrit la prochaine version à sortir.
        **{k: versions[0][k] for k in
           ("version", "branch", "declared_version", "imminent", "commits", "shown", "last_commit", "sections")},
        "versions": versions,
    }
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
