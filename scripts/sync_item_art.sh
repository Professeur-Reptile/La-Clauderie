#!/usr/bin/env bash
# ============================================================================
# Resynchronise l'art peint des objets depuis le repo du jeu.
# ----------------------------------------------------------------------------
# Le jeu committe ses icônes d'objets dans public/ui/items/<id>.webp ; le site
# les embarque dans assets/items/ (affichées par bis.html iconFor(), les fiches
# codex-popup.js et le guide Montures). À relancer quand une MAJ ajoute de
# l'art (« icônes peintes » dans les notes de version) :
#
#   bash scripts/sync_item_art.sh          # dernier tag publié
#   bash scripts/sync_item_art.sh v0.33.0  # tag précis
#
# Copie additive : les vieux .png/.jpg de la table de repli ITEM_IMG
# (bis.html) ne sont jamais supprimés.
# ============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

GAME_URL="https://github.com/levy-street/world-of-claudecraft"
TAG="${1:-}"
if [ -z "$TAG" ]; then
  TAG="$(git ls-remote --tags --refs "$GAME_URL" 'v*' | awk -F/ '{print $NF}' | sort -V | tail -1)"
fi
echo "Tag du jeu : $TAG"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
git -c advice.detachedHead=false clone --depth 1 --filter=blob:none --sparse \
  --branch "$TAG" --quiet "$GAME_URL" "$TMP/game"
git -C "$TMP/game" sparse-checkout set public/ui/items public/ui/mobs --quiet

mkdir -p assets/items assets/mobs
BEFORE=$(ls assets/items/*.webp 2>/dev/null | wc -l)
cp "$TMP/game/public/ui/items/"*.webp assets/items/
AFTER=$(ls assets/items/*.webp 2>/dev/null | wc -l)
echo "assets/items : $BEFORE → $AFTER webp (tag $TAG)"
MBEFORE=$(ls assets/mobs/*.webp 2>/dev/null | wc -l)
cp "$TMP/game/public/ui/mobs/"*.webp assets/mobs/
MAFTER=$(ls assets/mobs/*.webp 2>/dev/null | wc -l)
echo "assets/mobs : $MBEFORE → $MAFTER webp (tag $TAG)"
echo "Reste à commiter : git add assets/items assets/mobs && git commit"
