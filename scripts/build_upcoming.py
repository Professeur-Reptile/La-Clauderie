#!/usr/bin/env python3
"""Prépare la page « À venir » à partir de la branche de release du jeu.

Le jeu prépare chaque version sur une branche `release/vX.Y.Z` avant de la
taguer. Ce script lit les commits déjà mergés sur cette branche et les range
dans les SIX MÊMES rubriques que le bandeau des notes de version, pour que le
lecteur retrouve ses repères entre « ce qui est sorti » et « ce qui arrive ».

Entrée : un dépôt du jeu où la branche de release est fetchée.
Sortie : upcoming.json sur la sortie standard.

    python3 scripts/build_upcoming.py <dépôt-du-jeu> <tag-de-base> <branche> > upcoming.json

Rien n'est rédigé ici : les sujets de commit sont repris tels quels (en
anglais, ce sont les messages des développeurs). La page le dit clairement —
c'est un aperçu de travaux en cours, pas des notes de version.
"""
import hashlib
import json
import re
import subprocess
import sys
from datetime import datetime, timezone

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


def main():
    if len(sys.argv) < 4:
        sys.exit(__doc__)
    repo, base_tag, branch = sys.argv[1], sys.argv[2], sys.argv[3]

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
            # Empreinte du texte anglais : c'est la clé de la traduction dans
            # assets/upcoming-fr.json. Si les développeurs reformulent leur
            # message, l'empreinte change et la ligne repasse en anglais —
            # mieux vaut ça qu'une traduction qui ne dit plus la même chose.
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
    out = {
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "base_tag": base_tag,
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
    json.dump(out, sys.stdout, ensure_ascii=False, indent=1)
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
