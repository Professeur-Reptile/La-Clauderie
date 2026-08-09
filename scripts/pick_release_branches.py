#!/usr/bin/env python3
"""Choisit, dans le dépôt du jeu, le tag de base et les chantiers en cours.

    python3 scripts/pick_release_branches.py <url-du-dépôt-du-jeu>
    python3 scripts/pick_release_branches.py --self-test

Sortie : le TAG DE BASE (dernier publié) sur la première ligne, puis une
branche `release/*` par ligne, de la plus basse à la plus haute — celles qui
préparent une version au-dessus de ce tag. Le jeu mène parfois deux chantiers
en parallèle (un correctif v0.35.1 et la v0.36.0), d'où la liste.

Code de retour 1 (et rien sur la sortie standard) si le dépôt est injoignable
ou n'a aucun tag exploitable : l'appelant réessaiera au prochain passage.

Le jeu garde TOUTES ses vieilles branches de release, et plusieurs ne portent
pas un numéro de version : `release/v0.6-headline`, `release/v0.8-batch-2`,
`release/v0.8-misc-fixes`, `release/v0.23.0-mobile-fixes`,
`release/v0.24.0-ptr`. Les ignorer est le cœur de ce script : un tri
strictement numérique appliqué à tout ce que renvoyait `git ls-remote` a fait
échouer `update-upcoming.yml` toutes les 2 h du 7 au 9 août 2026
(`ValueError: invalid literal for int() with base 10: '6-headline'`), donc
sans aperçu de la version à venir NI pré-alerte « sortie imminente ».

Ignorer les suffixes protège aussi de plus subtil : un `release/v0.36.0-ptr`
compterait comme un second chantier `v0.36.0`, et `update-upcoming.yml` range
les chantiers par numéro de version — le doublon en écraserait un en silence.
"""
import re
import subprocess
import sys

# vX.Y ou vX.Y.Z, rien d'autre : pas de suffixe, pas de pré-version.
VERSION = re.compile(r"^v(\d+)\.(\d+)(?:\.(\d+))?$")


def version_key(name):
    """(major, minor, patch) pour un numéro de version, None si ce n'en est pas un."""
    m = VERSION.match(name.strip())
    if not m:
        return None
    return tuple(int(part or 0) for part in m.groups())


def ls_remote(url, *args):
    """Refs distantes, en ne gardant que le nom court. Liste vide si injoignable."""
    r = subprocess.run(["git", "ls-remote", *args, url], capture_output=True,
                       text=True, check=False)
    if r.returncode != 0:
        return []
    out = []
    for line in r.stdout.splitlines():
        parts = line.split("\t")
        if len(parts) == 2:
            out.append(parts[1])
    return out


def pick(tag_refs, head_refs):
    """(tag de base, branches au-dessus) à partir des refs brutes.

    Séparé de l'accès réseau pour rester vérifiable hors ligne (--self-test).
    """
    tags = []
    for ref in tag_refs:
        key = version_key(ref.rsplit("/", 1)[-1])
        if key:
            tags.append((key, ref.rsplit("/", 1)[-1]))
    if not tags:
        return None, []
    base_key, base = max(tags)

    branches = []
    for ref in head_refs:
        name = ref[len("refs/heads/"):] if ref.startswith("refs/heads/") else ref
        if not name.startswith("release/"):
            continue
        key = version_key(name.rsplit("/", 1)[-1])
        if key and key > base_key:
            branches.append((key, name))
    return base, [name for _key, name in sorted(branches)]


def self_test():
    tags = ["refs/tags/v0.34.0", "refs/tags/v0.35.0", "refs/tags/v0.35.1",
            "refs/tags/v0.9", "refs/tags/v0.8.0-rc1"]
    # Le vrai contenu du dépôt du jeu, branches biscornues comprises.
    heads = ["refs/heads/main",
             "refs/heads/release/claudium-cosmetics",
             "refs/heads/release/v0.6-headline",
             "refs/heads/release/v0.8",
             "refs/heads/release/v0.8-batch-2",
             "refs/heads/release/v0.8-misc-fixes",
             "refs/heads/release/v0.23.0-mobile-fixes",
             "refs/heads/release/v0.24.0-ptr",
             "refs/heads/release/v0.35.1",
             "refs/heads/release/v0.36.0"]
    cases = [
        # (tags, heads, base attendue, branches attendues)
        (tags, heads, "v0.35.1", ["release/v0.36.0"]),
        (["refs/tags/v0.34.0"], heads, "v0.34.0",
         ["release/v0.35.1", "release/v0.36.0"]),
        # Rien au-dessus du tag : la version annoncée vient de sortir.
        (tags + ["refs/tags/v0.36.0"], heads, "v0.36.0", []),
        # Un chantier en 10.x : comparaison numérique, pas alphabétique.
        (["refs/tags/v0.9"], ["refs/heads/release/v0.10.0"], "v0.9",
         ["release/v0.10.0"]),
        # Dépôt sans tag exploitable : on ne devine pas de base.
        (["refs/tags/nightly"], heads, None, []),
    ]
    ok = True
    for tag_refs, head_refs, want_base, want_branches in cases:
        base, branches = pick(tag_refs, head_refs)
        if (base, branches) != (want_base, want_branches):
            print(f"ÉCHEC : attendu {want_base!r} {want_branches!r}, "
                  f"obtenu {base!r} {branches!r}", file=sys.stderr)
            ok = False
    for bad in ["v0.6-headline", "v0.8-batch-2", "v0.24.0-ptr", "claudium-cosmetics",
                "v0.8.0-rc1", "v", "v1.2.3.4", ""]:
        if version_key(bad) is not None:
            print(f"ÉCHEC : {bad!r} ne devrait pas être un numéro de version",
                  file=sys.stderr)
            ok = False
    for good, want in [("v0.36.0", (0, 36, 0)), ("v0.8", (0, 8, 0)),
                       ("v10.0.1", (10, 0, 1))]:
        if version_key(good) != want:
            print(f"ÉCHEC : {good!r} → {version_key(good)!r}, attendu {want!r}",
                  file=sys.stderr)
            ok = False
    return 0 if ok else 1


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    if sys.argv[1] == "--self-test":
        sys.exit(self_test())

    url = sys.argv[1]
    base, branches = pick(ls_remote(url, "--tags", "--refs"),
                          ls_remote(url, "--heads"))
    if not base:
        sys.exit(1)
    print(base)
    for name in branches:
        print(name)


if __name__ == "__main__":
    main()
