# Runbook — site de La Clauderie

> **Style de réponse : DEUX PHRASES, EN FRANÇAIS SIMPLE.** L'utilisateur ne lit
> pas les réponses longues — il l'a dit explicitement le 10 août 2026. Pas de
> récapitulatif, pas de liste à puces, pas de « prochaines étapes ». Deux
> phrases, et c'est tout.
>
> Et en langage NORMAL : le 11 août 2026, après une réponse pleine de noms de
> commits, de branches et de workflows, il a répondu « rien compris », puis
> « mais écris-moi comme ça à chaque fois » sur la reformulation simple. Donc :
> dire ce qui a été fait et ce que ça change pour LUI, pas comment c'est fait.
> Pas de sha, pas de nom de fichier ni de workflow, pas de vocabulaire git —
> sauf s'il en demande. « Le BiS s'est mis à jour tout seul » plutôt que « le
> robot horaire a réinjecté const BIS via inject_bis.py dans c40a2a9 ».
>
> **« Mets à jour » = tout de suite, avec les données de l'instant.** D'abord
> regarder si le dernier tag du jeu a bougé (`git ls-remote --tags`) : s'il a
> bougé, c'est la procédure ⚡ « nouvelle MAJ » ci-dessous ; sinon, c'est la
> page `a-venir.html`. Dans les deux cas, refaire le relevé à la seconde
> (`bash scripts/refresh_upcoming.sh`) et écrire d'après CE relevé — jamais
> d'après un `upcoming.json` vieux de deux heures.

Site statique de guilde pour *World of ClaudeCraft*. Déployé sur
**laclauderie.fr** (OVH) **à chaque push sur `main`**. Il n'y a plus de
miroir GitHub Pages : retiré le 6 août 2026, il échouait 2 fois sur 3 (voir
`README.md`).

## ⚡ Quand l'utilisateur dit « il y a une nouvelle MAJ »

> **Ce n'est plus automatique.** La Routine Claude « Nouvelle version WoCC —
> rédaction » a été SUPPRIMÉE le 8 août 2026 : elle tournait toutes les heures
> et consommait des tokens. C'est donc l'utilisateur qui déclenche, et la
> procédure ci-dessous est le seul circuit. Avant de commencer, vérifier
> que la version n'est pas déjà en tête de `patch-notes.json` sur `origin/main`.
> Penser aussi à fermer l'issue « Nouveautés à ajouter » que
> `check-game-version.yml` ouvre de son côté — plus personne ne le fait.

Tout le reste est automatisé (voir plus bas) — **ne le refais pas**. Ta tâche
se limite à la partie rédactionnelle des « Nouveautés » :

1. **Trouver le contenu de la version.** Récupérer les notes de version du jeu
   (`https://github.com/levy-street/world-of-claudecraft/releases/tag/vX.Y.Z`).
1bis. **Vérifier les affirmations chiffrées/mécaniques contre le code, pas
   seulement contre le résumé des notes.** Les notes officielles décrivent
   l'INTENTION ; le comportement réel peut différer (arrondis, interactions
   entre systèmes, cas non mentionné). Pour chaque chiffre ou règle qui finira
   dans une carte/fiche détaillée : `git diff v<précédente>..v<actuelle> --
   src/...` sur le fichier concerné dans `../world-of-claudecraft`, et si un
   test existe (`tests/*.test.ts`), le lire — les exemples chiffrés qui y sont
   épinglés (`it('...', () => { expect(...).toBe(...) })`) valent plus que la
   prose des notes. Exemple vécu (v0.32.2) : les notes annonçaient une durée
   de vie de portail de Faille « 2 heures », vrai seulement dans le cas où
   personne ne le termine — `tests/rift_portals.test.ts` montre qu'un clear
   rapide fait revenir le prochain portail dès la marque **1 h**, ce que des
   joueurs ont signalé et qui a demandé de reformuler `failles.html` et
   `notes/v0.32.2.html`. Si un écart est trouvé : reformuler pour décrire le
   comportement réel (avec la source exacte), jamais recopier la formulation
   du jeu telle quelle sans vérification quand un chiffre ou une mécanique
   précise est en jeu.
2. **Créer `notes/vX.Y.Z.html` + `notes/vX.Y.Z.en.html`** en copiant la structure
   EXACTE de la version la plus récente du dossier `notes/` (même `<style>`, même
   scaffolding modal, mêmes classes). N'adapter que : version, méta, hero,
   bandeau « En un coup d'œil », sections (bulles + fiches détaillées au clic)
   et le dict `DETAILS`.
   - **Le bandeau `<nav class="digest">` est OBLIGATOIRE et son sommaire ne
     varie JAMAIS** (décision d'août 2026 : les titres de sections sont
     narratifs et changent à chaque version, le lecteur ne savait plus où
     regarder). Toujours ces six rubriques, toujours dans cet ordre :
     ⚔️ Classes & sorts · 🔨 Métiers & récolte · 🐉 Donjons, failles & boss ·
     🗺️ Monde & quêtes · 🏰 Guilde & social · ⚙️ Confort & technique.
     Chaque rubrique renvoie par `href="#ancre"` à la section qui la traite
     (ancres `id=` sur les `<section>`) ; si la MAJ ne touche pas une rubrique,
     garder la ligne avec `class="none"` et un `—` plutôt que de la supprimer.
     La ligne Classes porte le sens du changement PAR CLASSE, avec
     `<b class="up">Classe ↑</b>` (amélioration), `<b class="down">Classe ↓</b>`
     (nerf) ou `<b class="eq">Classe =</b>` (inchangé / cosmétique) — c'est la
     question n°1 des joueurs. Ces flèches suivent la même règle de
     vérification que le reste (étape 1bis) : elles se justifient par le code
     du jeu, pas par le ton des notes officielles.
   - Marquer les termes/objets/sorts/monstres cliquables avec
     `<span data-codex="type|Nom">…</span>` (types usuels : `term|ability|item|mob|npc` ;
     `codex-popup.js` accepte aussi `talent|spec|quest|dungeon|delve|set|zone`).
     Vérifier que les noms existent dans `../wocc-knowledge-base/data/*.json`.
   - La page FR redirige vers `.en.html` si `lang=en` (et inversement) — garder
     les deux scripts de redirection en tête de fichier.
   - **Si la MAJ ajoute des objets équipables/montables**, inclure une section
     « Les nouveaux objets, et où les trouver » (modèle : section 06 de
     `notes/v0.32.0.html`) : qui drope quoi, à quel taux, avec un span
     `data-codex` par objet.
2ter. **Tenir les traductions françaises des fiches Codex** :
   `python3 scripts/check_codex_fr.py` liste les descriptions (sorts, talents,
   spés, panoplies) ajoutées ou modifiées par la MAJ qui n'ont pas encore leur
   traduction MAISON dans `assets/codex-fr.json` — les traduire soi-même
   depuis l'anglais (charte dans l'en-tête du script ; décision d'août 2026 :
   ne JAMAIS recopier la traduction du jeu, jugée trop inégale), avec
   l'empreinte `_src` (sha1[:8] du texte anglais). Les NOMS français, eux,
   sont automatiques : la KB les extrait du client (`data/I18N_FR.json`) et
   `codex-popup.js` les affiche en discret à côté des noms anglais et dans
   les fiches — rien à faire.
3. **Ajouter une entrée en tête de `patch-notes.json`** (version, date, titre,
   resume, temps_forts, page + variantes `_en` et `page_en`). L'accueil et la
   page Nouveautés se mettent à jour tout seuls à partir de ce fichier.
2bis. **Si la MAJ ajoute des icônes peintes** (« painted icons » dans les
   notes), resynchroniser l'art embarqué : `bash scripts/sync_item_art.sh`
   puis commit d'`assets/items/`, `assets/mobs/`, `assets/weapons/` et
   `assets/skills/`. Trois conventions distinctes, à ne pas confondre :
   - **objets** : `assets/items/<id>.webp` — **y compris les jumelles
     `heroic_`, qui ont leur PROPRE art**. Cette ligne affirmait le contraire
     jusqu'au 5 août 2026 ; c'était faux, et le code le suivait : les 46
     objets héroïques du site affichaient l'art de leur version normale
     (signalé par un joueur sur la Direfang Crown). Au tag v0.34.0, sur 47
     `heroic_*.webp` livrés par le jeu, **zéro** reprend l'art de sa base.
     Demander `<id>.webp` d'abord, la base ne servant que de repli ;
   - **armes** : PAS d'art par id — le jeu rend une vignette partagée par
     modèle 3D, `assets/weapons/<modèle>.jpg`, via la table publiée dans
     `data/ICONS.json` (`weapons`). Sans elle, toutes les armes du BiS
     s'affichaient en case vide (incident du 5 août 2026) ;
   - **sorts** : `assets/skills/<classe>/<id>.webp`, uniquement pour les ids
     listés dans `ICONS.json` (`abilityIcons`) — les autres sont dessinés
     proceduralement par le client, donc **ne rien afficher** plutôt qu'une
     image approchante.
   Cet art alimente `iconFor()` de `bis.html`, les fiches de `codex-popup.js`
   et le guide Montures.
3bis. **Mettre à jour les badges « à jour de la version »** : `pvp.html`,
   `metiers.html`, `failles.html` et `montures.html` portent
   `data-version="vX.Y.Z"` sur leur inclusion de
   `assets/version.js` — passer cet attribut à la nouvelle version APRÈS avoir
   relu la page concernée (guide PvP si la MAJ touche talents/sorts/PvP,
   partie éditoriale des Métiers sinon elle reste à l'ancienne version et le
   badge affichera honnêtement « relecture en cours »). `bis.html` est bumpé
   automatiquement par `inject_bis.py`. Le badge compare ce `data-version` à
   la dernière entrée de `patch-notes.json` : tant que l'étape 3 n'est pas
   faite, tous les badges restent verts — c'est l'ajout de la nouvelle entrée
   qui les fait basculer.
3ter. **Mettre à jour le guide « Spé & talents » (`const BUILDS` de `bis.html`)**
   pour les classes touchées par la MAJ : choix par rangée de talents (format
   `["Option", "niv. X", {fr, en}]`), maîtrise, rotation, astuce — en vérifiant
   chaque nom contre `TALENTS.json` / `ABILITIES.json` de la KB. C'est la
   partie ÉDITORIALE de la page Builds : le recalcul automatique ne couvre que
   le bloc `const BIS` (l'équipement). Si la MAJ ajoute un rôle à une classe
   (ex. Mage soigneur en v0.27.0), ajouter aussi ce rôle dans `ROLES` de
   `scripts/compute_bis.py` pour que l'onglet et le BiS existent.
   - **Exister dans `ABILITIES.json` ne veut PAS dire être lançable.** Le jeu
     garde ses sorts retirés dans la table (pour reconnaître et jeter les
     barres d'action enregistrées) et les marque `hiddenFromPlayer` : ils
     disparaissent alors du grimoire du joueur. Un nom de rotation doit donc
     être vérifié sur CE drapeau, pas sur la présence d'une fiche. Vécu le
     16 août 2026 (signalé par un joueur) : la rotation du Paladin proposait
     encore Oathbrand, Lightmend, Oath of Iron, Steadfast Aura et Reproach,
     retirés à la refonte v0.36 — dix mois de guide faux sans que rien ne
     sonne. `check_codex_refs.py` refuse désormais un `const BUILDS` qui cite
     un sort retiré.
   - Vérifier aussi la **spé** : beaucoup de capacités portent `specs` et
     n'existent que pour l'une des trois (Sunward Disc est Faithwarden, Mercy
     Lance est Sunmender). Une rotation de tank qui cite un sort de heal est
     aussi fausse qu'un sort supprimé.
   - **Toutes les classes, toutes les spés, à chaque fois** (consigne du
     16 août 2026 : « il faut que tu t'assures tout le temps que toutes les
     rotations sont bonnes sur toutes les classes »). Ça ne se fait plus à la
     main : `node scripts/check_builds.mjs` relit les **36 builds** des deux
     guides (`const BUILDS` de `bis.html` + `const PVP` de `pvp.html`) et
     tourne en CI. Attention au piège qui a laissé passer dix mois d'erreurs :
     une classe à plusieurs spés pour un rôle range ses builds dans une
     **LISTE** (Mage, Voleur, Chasseur, Démoniste, Prêtre, Chaman, Guerrier),
     et une vérification écrite à la va-vite ne regarde que la première.
   - Le script contrôle, par build : la spé et son rôle, le nom de la
     maîtrise, le niveau de rangée de chaque talent, et chaque nom de rotation
     — existence, `hiddenFromPlayer`, spé autorisée, **accordabilité** (kit de
     classe, talent, signature de spé ou remplacement d'action) et présence de
     la signature de la spé. Il signale en plus, sans bloquer, une rotation qui
     ignore la moitié des capacités propres à sa spé : c'est le symptôme d'une
     refonte passée à côté du guide.
3quater. **Les vérifications tournent en CI** (`check-site.yml`, appelé par les
   deux workflows de déploiement : un site cassé ne part plus en ligne). Pour
   un retour immédiat avant de pousser, les lancer à la main —
   `node scripts/check_pages.mjs` ouvre en plus chaque page dans un navigateur
   (erreurs JS, requêtes en échec, images cassées, zones vides) :
   - `python3 scripts/check_inline_js.py` — syntaxe de tous les scripts
     embarqués. Une apostrophe droite dans une chaîne JS à apostrophes
     simples a déjà vidé l'onglet Métiers en production (4 août 2026) : dans
     les textes français, TOUJOURS l'apostrophe typographique (’).
   - `python3 scripts/check_codex_refs.py` — les `data-codex` pointent bien
     quelque chose, et sans ambiguïté. Le jeu réutilise des noms anglais pour
     des entités différentes (deux sorts « Aether Surge ») : dans ce cas,
     référencer **l'id du jeu** (`ability|arcane_surge`), jamais le nom. Même
     réflexe pour tout ce qui est susceptible d'être renommé par une MAJ —
     l'id, lui, ne bouge pas. Le nom réorienté se déclare dans `CX_REF`
     (en-tête du script de `bis.html`), pas au cas par cas.
     Le script relit aussi les noms cités par le `const BUILDS` de
     `bis.html` — ils ne sont pas écrits en dur dans la page, c'est
     `cxNames()` qui en fabrique un `data-codex` à l'affichage, donc rien ne
     les vérifiait : il refuse un sort introuvable, ambigu, ou retiré du
     grimoire. Le contrôle des guides eux-mêmes (rotations, talents, spés) est
     allé vivre dans `scripts/check_builds.mjs` — voir l'étape 3ter.
4. **Commit sur `claude/site-update-6uhdmv`, puis merge direct sur `main`**
   (fast-forward : `git push origin claude/site-update-6uhdmv:main`). Le déploiement
   part tout seul. **Ne pas ouvrir de PR** sauf demande explicite.
   - **Le merge se fait SANS demander, à la fin de chaque tâche** (consigne du
     15 août 2026 : « et à la fin tu merges, n'attends pas que je te le dise »).
     Ça vaut aussi quand la session impose une AUTRE branche de travail que
     `claude/site-update-6uhdmv` : on développe sur celle qu'on nous donne,
     puis on la fast-forward sur `main` comme ici. Une page de notes qui reste
     sur une branche n'est pas publiée, donc le travail n'est pas fini.

### Si la MAJ vient de sortir (à la minute près)
Les robots (Codex + BiS) tournent sur cron ; pour publier tout d'un coup sans
attendre, forcer les workflows côté chaque repo :
- KB : onglet Actions → « Update WoCC knowledge base » → *Run workflow*.
- Site : onglet Actions → « Recalcul du BiS (Builds) » → *Run workflow*.
Puis vérifier que `wocc-knowledge-base/data/_meta.json` est bien sur le nouveau tag
avant de t'appuyer dessus pour le BiS ou les liens Codex.

## 🤖 Ce qui est DÉJÀ automatique — ne pas le refaire à la main

| Quoi | Mécanisme | Fréquence |
|---|---|---|
| Données du Codex | `wocc-knowledge-base` → `update-knowledge-base.yml` | ~5 min après chaque tag du jeu |
| **Builds / BiS** (`bis.html`) | `update-bis.yml` → `compute_bis.py` + `inject_bis.py` | cron horaire ; s'arrête en ~10 s si la KB n'a pas bougé (`scripts/.kb-state`) — elle ne change qu'à chaque version du jeu |
| **Récolte & Métiers** (`metiers.html`) | `update-bis.yml` → `build_craft.py` + `inject_craft.py` | idem |
| Classement guilde (`guild.json`) | `update-guild-rank.yml` | toutes les 3 h |
| Déploiement (OVH) | `deploy.yml` (vérifie, puis envoie par FTP) | à chaque push `main` (+ cron 6 h pour rafraîchir la copie du Codex) |
| **Aperçu de la version à venir** (`a-venir.html`) | `update-upcoming.yml` → `build_upcoming.py` lit TOUTES les branches `release/*` au-dessus du dernier tag (le jeu mène parfois un correctif v0.35.1 ET la v0.36.0 en parallèle — les deux comptent, demande du 7 août 2026) | toutes les 2 h ; ne commite/republie que si l'ensemble des chantiers, une imminence, ou ≥ 25 commits bougent |
| Pré-alerte « sortie imminente » | même workflow : ouvre une issue dès que `package.json` monte de version sur la branche de release | toutes les 2 h |
| Rappel « version manquante » (filet de secours) | `check-game-version.yml` ouvre une issue | toutes les heures |

> **`a-venir.html` suit TOUS les chantiers en parallèle.** `upcoming.json`
> garde à sa racine la prochaine version à sortir (compatibilité) et liste
> chaque branche dans `versions[]` ; quand il y en a plusieurs, la page
> affiche un bandeau par chantier (commits, fraîcheur, imminence) tout seul.
> L'ÉDITORIAL, lui, couvre toujours la version LA PLUS HAUTE (la grande),
> avec une courte section « Le correctif vX.Y.Z » en tête si un correctif se
> prépare aussi — à écrire à la main, guidé par `data-for`,
> `data-commits` et `data-chantiers` sur `#editorial`. Les NOTES d'un
> correctif sorti, elles, passent par la procédure ⚡ ci-dessus,
> x.1 compris.
>
> **Quand l'utilisateur demande « mets à jour la page à venir », le RELEVÉ
> fait partie du travail — et il se fait DEUX fois :**
>
> ```sh
> bash scripts/refresh_upcoming.sh   # avant de rédiger
> …rédaction…
> bash scripts/refresh_upcoming.sh   # juste avant de committer
> ```
>
> Le script demande au dépôt du jeu son dernier tag et ses chantiers en cours
> (même choix que `update-upcoming.yml`), fetche les branches, régénère
> `upcoming.json`, et surtout **liste les nouveautés arrivées depuis le relevé
> précédent** — c'est cette sortie qu'il faut lire avant d'écrire. Le
> `upcoming.json` du dépôt ne suffit JAMAIS : il date du dernier passage du
> cron (jusqu'à 2 h) et la branche du jeu bouge vite.
>
> Le second passage n'est pas une précaution de principe : le 10 août 2026, le
> Reliquaire (une fonctionnalité entière, ~110 commits) a atterri **entre** la
> rédaction du résumé et sa relecture, et seul le second relevé l'a vu.
> Commiter `upcoming.json` avec la page.
>
> Deux dates distinctes dans le bandeau, à ne pas confondre (elles l'étaient
> jusqu'au 10 août 2026) : **« Relevé »** = `generated`, quand le JSON a été
> produit ; **« Dernier commit du jeu »** = `last_commit`, l'âge du sommet de
> la branche. Une branche qui n'a pas bougé de la nuit affichait « relevé il y
> a 6 h » une minute après un relevé tout frais.
>
> **`a-venir.html` a deux moitiés.** Le haut est une VRAIE page de notes,
> rédigée à la main sur le gabarit de `notes/vX.Y.Z.html` (même bandeau,
> mêmes cartes, mêmes fiches au clic) — demande du 6 août 2026 : « fais-moi
> la page habituelle, juste pour à venir ». Elle porte `data-for="vX.Y.Z"`
> sur `#editorial` : dès que `upcoming.json` annonce une autre version (ou
> plus rien), cette partie se masque toute seule et le dit. À réécrire à la
> main quand le jeu passe à préparer une nouvelle version, ou quand la
> branche a beaucoup grossi depuis `data-commits` (le nombre de
> commits à partir duquel le texte a été écrit) : la branche grossit vite,
> 99 → 256 commits en une journée le 6 août 2026, donc un texte figé se
> périme en quelques heures. Ne JAMAIS y mettre de chiffre
> non vérifié : c'est du travail en cours, les durées et valeurs bougent — la
> fiche « craft » dit explicitement pourquoi elle n'en donne pas.
>
> Le bas de la page (`#tout`) est la liste brute automatique.
> **`upcoming.json`** ne se rédige pas et ne s'affiche PLUS : c'est
> `scripts/build_upcoming.py` qui range les commits du jeu par rubrique, et
> la page ne s'en sert que pour trois choses — le numéro de version, la
> fraîcheur du relevé, et l'expiration de la partie rédigée. La liste des
> commits a été RETIRÉE de la page le 6 août 2026, avec tout son dispositif
> de traduction : « le site est fait pour les joueurs, pas pour les
> développeurs ». Un joueur ne veut pas un journal de développement, il veut
> un ordre de grandeur — un ou deux nerfs de classe, ou une nouvelle zone ?
> La précision viendra des vraies notes à la sortie. Ne jamais réintroduire
> de libellés de commit bruts sur une page publique.
>
> Le **BiS est déterministe** : il ne se rédige pas, il se calcule. Ne jamais
> éditer le bloc `const BIS = {…}` de `bis.html` à la main — c'est
> `scripts/compute_bis.py` (données réelles de la KB) réinjecté par
> `scripts/inject_bis.py` qui le produit, et le workflow le refait tout seul.
>
> Idem pour **`metiers.html`** (Récolte & Métiers) : le bloc `const CRAFT = {…}`
> est produit par `scripts/build_craft.py` + `scripts/inject_craft.py` à partir
> de `GATHER_NODES`, `FISHING_TABLES`, `ALL_RECIPES` et `ZONES` de la KB. Ne pas
> l'éditer à la main. La page se suffit à elle-même (données embarquées) pour
> marcher aussi bien sur OVH que sur GitHub Pages (où `/data/` n'est pas servi).
> **Exception éditoriale** : la fonction `renderEnchant()` (guide Enchantement)
> dans le second `<script>` de `metiers.html` est rédigée à la main. Depuis
> l'audit de juillet 2026, la KB extrait le registre du jeu dans
> `data/ENCHANTS.json` (source : `src/sim/content/enchants.ts`) — s'en servir
> pour VÉRIFIER le guide à chaque MAJ qui touche l'enchantement.

## 🧭 La barre de navigation — source de vérité UNIQUE

Les onglets du site (Accueil, Builds, Métiers, Nouveautés, Codex) sont définis
**à un seul endroit** : `assets/nav.js` (tableau `TABS`). Toutes les pages —
`index.html`, `bis.html`, `metiers.html`, `patch-notes.html`, `notes/*.html` —
et **la page Codex** (`../wocc-knowledge-base/site/index.html`) partagent cette
liste. Pour ajouter / renommer / réordonner un onglet : **modifier uniquement
`assets/nav.js`**, jamais les barres page par page.

- Chaque page a juste `<nav class="topnav" data-guild-nav data-current="X"></nav>`
  (ou `class="gb-nav"` sur le Codex) que `nav.js` remplit. `data-current` = l'id
  de l'onglet actif. `nav.js` gère les chemins selon l'hôte (racine du domaine,
  Pages, `/codex/`, `notes/`) et préserve le bouton FR/EN existant.
- Le Codex charge `nav.js` depuis `https://laclauderie.fr/assets/nav.js` (une
  seule copie, servie par le déploiement du site) — donc il ne peut plus « rater »
  un nouvel onglet.

## 📱 App installable (PWA)

Le site s'ajoute à l'écran d'accueil : `manifest.json` + `sw.js` (racine) +
`assets/pwa.js` + `assets/icon-*.png`. Toute page doit garder dans son `<head>`
le `<link rel="manifest">` et le `<script src="assets/pwa.js" defer>` (chemins
relatifs — `../` depuis `notes/`) ; en copiant une page existante, ils suivent
tout seuls. Le service worker est en **réseau d'abord** (pas de contenu
périmé) ; si un jour il faut purger le cache de tout le monde, incrémenter
`CACHE` dans `sw.js`. Icônes : `python3 scripts/make_icons.py` (Pillow).

## 📖 Code source du jeu — disponible dans chaque session

Un hook SessionStart (`.claude/hooks/session-start.sh`, présent dans ce repo
et dans la KB) clone le code du jeu en lecture seule dans
`../world-of-claudecraft`, au **dernier tag publié**. Clone partiel : `src`,
`server`, `scripts`, `tests`, `mediawiki` + fichiers racine — les assets
(`docs/`, `public/`, ~1,4 Go) sont exclus. Le dépôt
(`levy-street/world-of-claudecraft`) est public mais externe : il ne peut pas
être attaché comme source de session (`add_repo` échouera — ne pas réessayer),
ce clone est la façon officielle d'y accéder.

- **Session multi-repos** (racine = dossier parent, pas un repo) : le hook ne
  se déclenche pas tout seul. Si `../world-of-claudecraft` est absent, le
  lancer à la main : `bash .claude/hooks/session-start.sh` (depuis ce repo).
- S'en servir pour vérifier le contenu du jeu à la source quand les JSON de la
  KB ne suffisent pas (ex. enchantements : `src/sim/content/enchants.ts`).
- Vérifier le tag du clone avant de s'y fier :
  `git -C ../world-of-claudecraft describe --tags`.
- Lecture seule : ne jamais commiter ni pousser dans ce clone.

## Branche & déploiement
- Développer sur `claude/site-update-6uhdmv`, merger sur `main` (source du déploiement).
  Si la session impose une autre branche de travail, développer sur celle-là —
  mais le merge sur `main` reste dû, et **sans le demander** (voir l'étape 4).
- La knowledge base (`Reptile-New/wocc-knowledge-base`, repo public) fournit `data/`
  (servi sous `/data/`) et `site/` (le Codex sous `/codex/`).

Détails des pages et des fiches Codex : voir `README.md`.
