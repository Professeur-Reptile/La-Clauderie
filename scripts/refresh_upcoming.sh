#!/usr/bin/env bash
#
# Refait le RELEVÉ de la page « La prochaine version », à l'instant.
#
#     bash scripts/refresh_upcoming.sh
#
# Une demande « mets à jour la page à venir » commence TOUJOURS par ça, et se
# termine par ça (voir CLAUDE.md). Deux fois, parce que la branche du jeu bouge
# pendant qu'on rédige : le 10 août 2026, le Reliquaire — une fonctionnalité
# entière, ~110 commits — a atterri entre la rédaction du résumé et sa
# relecture, et il a fallu un second relevé pour le voir.
#
# Ce que fait le script, dans l'ordre :
#   1. demande au dépôt du jeu son dernier tag et ses branches de release en
#      cours (`pick_release_branches.py`, le MÊME choix que `update-upcoming.yml`
#      — un correctif et la grande version peuvent se préparer en parallèle) ;
#   2. fetch ces branches dans le clone local `../world-of-claudecraft` ;
#   3. régénère `upcoming.json` avec `build_upcoming.py`, le script officiel ;
#   4. affiche ce qui a bougé DEPUIS LE RELEVÉ PRÉCÉDENT — c'est la sortie qui
#      compte : elle dit ce que le résumé en ligne ne couvre pas encore.
#
# Le clone du hook SessionStart est SUPERFICIEL (greffé sur le dernier tag) :
# sans `--unshallow`, `git log v<tag>..branche` compte toute l'histoire du
# dépôt (11 370 commits au lieu de 1 478, constaté le 10 août 2026). Le script
# le déplie une fois pour toutes si besoin.
#
# Lecture seule sur le clone du jeu : on ne fait que fetcher.
set -euo pipefail

GAME_URL="https://github.com/levy-street/world-of-claudecraft"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
clone="${1:-$here/../world-of-claudecraft}"

cd "$here"

if [ ! -d "$clone/.git" ]; then
  echo "Clone du jeu absent ($clone) — lancer d'abord : bash .claude/hooks/session-start.sh" >&2
  exit 1
fi

echo "→ Choix du tag de base et des chantiers en cours…"
if ! sel=$(python3 scripts/pick_release_branches.py "$GAME_URL"); then
  echo "Dépôt du jeu injoignable — relevé impossible." >&2
  exit 1
fi
base=$(echo "$sel" | head -1)
branches=$(echo "$sel" | tail -n +2)

if [ -z "$branches" ]; then
  echo "Aucune branche de release au-dessus de $base : rien en préparation."
  echo "La page se videra d'elle-même au prochain passage du workflow."
  exit 0
fi
echo "  base $base · chantiers :" $branches

# Le clone du hook est greffé sur un seul commit : sans ça, la plage
# v<tag>..branche ne veut rien dire.
if [ -f "$clone/.git/shallow" ]; then
  echo "→ Clone superficiel : dépliage (une seule fois)…"
  git -C "$clone" fetch --quiet --filter=blob:none --unshallow origin
fi

echo "→ Relevé des branches du jeu…"
git -C "$clone" fetch --quiet --filter=blob:none origin "refs/tags/$base:refs/tags/$base" --force || true
for b in $branches; do
  git -C "$clone" fetch --quiet --filter=blob:none origin "refs/heads/$b:refs/heads/$b" --force
done

python3 scripts/build_upcoming.py "$clone" "$base" $branches > upcoming.new.json

# Ce qui a bougé depuis le relevé précédent : la vraie sortie du script.
python3 - "$here" <<'PY'
import json, os, sys

here = sys.argv[1]
new = json.load(open(os.path.join(here, "upcoming.new.json"), encoding="utf-8"))
old_path = os.path.join(here, "upcoming.json")
try:
    old = json.load(open(old_path, encoding="utf-8"))
except Exception:
    # Absent, ou laissé en conflit par un rebase : on repart de zéro plutôt
    # que de planter au milieu d'un relevé.
    old = {}

print()
for v in new["versions"]:
    was = next((o for o in (old.get("versions") or []) if o["version"] == v["version"]), {})
    delta = v["commits"] - was.get("commits", 0) if was else v["commits"]
    flag = "  ⏳ SORTIE IMMINENTE (le jeu a monté son package.json)" if v["imminent"] else ""
    print(f'{v["version"]} : {v["commits"]} commits'
          f'{f" (+{delta} depuis le relevé précédent)" if delta else " (inchangé)"}{flag}')
print(f'Relevé pris à l\'instant · dernier commit du jeu : {new["last_commit"]}')

# Les nouveautés que le résumé en ligne ne couvre pas encore. C'est ce qu'il
# faut LIRE avant de rédiger — pas pour recopier des libellés de commit sur la
# page (interdit), mais pour ne rien rater d'important.
seen = {i["h"] for s in (old.get("sections") or []) for i in s["items"]}
total = 0
for s in new["sections"]:
    fresh = [i for i in s["items"] if i["h"] not in seen]
    if not fresh:
        continue
    total += len(fresh)
    print(f'\n== {s["fr"]} — {len(fresh)} nouveau(x)')
    for i in fresh[:25]:
        print(f'   {i["kind"]:4} [{i["scope"]}] {i["text"][:120]}')
    if len(fresh) > 25:
        print(f'   … et {len(fresh) - 25} de plus')
if not total:
    print("\nRien de neuf depuis le relevé précédent.")
else:
    print(f'\n{total} entrées nouvelles depuis le relevé précédent — les lire avant de rédiger.')
PY

mv upcoming.new.json upcoming.json
echo
echo "✓ upcoming.json régénéré. Le commiter AVEC la page."
