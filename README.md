# La Clauderie 🛡️

Site de la guilde francophone **La Clauderie** sur
[World of ClaudeCraft](https://worldofclaudecraft.com/).

Site statique, simple : un calendrier de guilde, le Discord, et les nouveautés du jeu.

## Pages

| Fichier | Rôle |
|---|---|
| `index.html` | Accueil : Discord, guides, puis 3 onglets — Calendrier (à venir + passés), Membres, Faits d'armes |
| `bis.html` | Builds par classe et rôle : spé, talents, rotation (éditorial, bloc `BUILDS`) et best-in-slot (bloc `BIS`, recalculé automatiquement par `update-bis.yml` → `scripts/compute_bis.py`) |
| `metiers.html` | Récolte & Métiers : où récolter (minerai/bois/herbes/pêche) par zone et toutes les recettes par métier (bloc `CRAFT` recalculé automatiquement par `update-bis.yml` → `scripts/build_craft.py`, données embarquées) + guide Enchantement éditorial |
| `pvp.html` | Guide PvP : modes, Honor/Warfare, un build d'arène par classe, compos 2v2 et Protect Yumi — éditorial, vérifié sur les documents de design du jeu |
| `failles.html` | Guide Failles (v0.32.0) : portails C/B/A/S, course au first-clear, butin rang par rang, forge à Essence — éditorial, vérifié sur le code du jeu |
| `montures.html` | Guide Montures (v0.32.0) : système de rênes, les sept montures, sources, prix et taux de drop — éditorial, vérifié sur le code du jeu |
| `assets/nav.js` | La barre de navigation de TOUTES les pages (site + Codex) — source de vérité unique des onglets |
| `assets/codex-popup.js` | Fiches incrustées : ouvre objets, sorts, talents, monstres, PNJ, quêtes et glossaire **dans la page**, à partir des données du Codex (voir plus bas) |
| `manifest.json` + `sw.js` + `assets/pwa.js` | **App installable** : le site s'ajoute à l'écran d'accueil (voir « Installer le site comme une app »). Icônes régénérables par `scripts/make_icons.py` |
| `woc.html` | Tuto « Acheter des $WOC » : wallet Solana, achat de SOL/USDC, swap vers le token officiel, liaison en jeu et Claudium à ~20 % de remise — éditorial, sourcé sur la doc du jeu (README + docs/claudium-store.md, v0.27) |
| `admin.html` | Espace officiers : gérer le calendrier, les membres et les faits d'armes |
| `patch-notes.html` | Historique de **toutes** les mises à jour du jeu, la plus récente en premier |
| `notes/vX.Y.Z.html` | Les nouveautés détaillées d'une version (une page par mise à jour) |
| `patch-notes.json` | La liste des mises à jour (alimente l'historique **et** la carte de l'accueil) |
| `events.json` | Les données du calendrier (modifiées via l'espace officiers) |
| `members.json` | Les membres de la guilde : pseudo, rôles, classe (modifiés via l'espace officiers) |
| `roles.json` | Les rôles de guilde (Maître de guilde, Officier, Head manager…) — l'ordre sert uniquement à colorer les pastilles de l'espace officiers |
| `guild.json` | Les infos de la guilde (classement serveur, **mis à jour automatiquement toutes les 3 h** par `update-guild-rank.yml` depuis l'API du jeu) |
| `achievements.json` | Les faits d'armes, avec les membres participants (modifiés via l'espace officiers) |

## Ajouter les nouveautés d'une mise à jour

À chaque nouvelle version du jeu, on ajoute ses nouveautés au site **sans toucher
aux versions précédentes** — l'historique se construit au fil du temps :

1. **Créer `notes/vX.Y.Z.html` ET `notes/vX.Y.Z.en.html`** sur le modèle de la
   version la plus récente du dossier `notes/` : mêmes sections (bulles
   résumées + fiches détaillées au clic), avec le contenu de la nouvelle mise
   à jour. Les deux pages se redirigent l'une vers l'autre selon la langue
   choisie (scripts en tête de fichier — adapter le numéro de version).
2. **Ajouter une entrée en tête de `patch-notes.json`** : version, date, titre,
   résumé, temps forts, le chemin `notes/vX.Y.Z.html`, et les variantes
   anglaises (`titre_en`, `resume_en`, `temps_forts_en`, `page_en`).

La page « Nouveautés du jeu » et la carte de l'accueil (qui affiche toujours la
dernière version) se mettent à jour automatiquement.

3. **Marquer les mots cliquables** (voir la section « Fiches incrustées ») :
   dans la nouvelle page, entourer les termes techniques et les noms d'objets,
   monstres, PNJ, quêtes… d'un `<span data-codex="…">` pour qu'un clic ouvre
   leur fiche sans quitter le site.
4. **Mettre à jour le guide « Spé & talents »** (`const BUILDS` de `bis.html`)
   pour les classes touchées par la mise à jour — c'est la partie éditoriale de
   la page Builds ; l'équipement (`const BIS`), lui, est recalculé tout seul
   par `.github/workflows/update-bis.yml`.

> En pratique, une Routine Claude fait tout cela automatiquement à chaque
> nouvelle version (procédure détaillée dans `CLAUDE.md`) — cette section sert
> de référence si on doit le faire à la main.

## Fiches incrustées (codex-popup.js)

Partout sur le site, un élément marqué `data-codex="type|référence"` devient
cliquable et ouvre une **petite fiche dans la page** (pas de changement de
site) :

```html
<span data-codex="item|Swiftfang Talisman">Swiftfang Talisman</span>
<span data-codex="ability|Mending Light">Mending Light</span>   <!-- sort -->
<span data-codex="ability|Seething Fury">Seething Fury</span>  <!-- talent|Nom marche aussi (rangées Talents 2.0) -->
<span data-codex="mob|Thunzharr">Thunzharr</span>
<span data-codex="term|soulbound">soulbound</span>              <!-- glossaire FR -->
<span data-codex="auto|Oathbrand">Oathbrand</span>              <!-- devine le type -->
```

- **Types** : `item`, `ability`, `talent`, `spec`, `mob`, `npc`, `quest`,
  `dungeon`, `delve`, `set`, `zone`, `term` (glossaire français intégré) et
  `auto` (essaie tout dans l'ordre).
- **Référence** : un id du jeu ou un nom (insensible aux accents ; un nom
  partiel suffit s'il est sans ambiguïté).
- **Toujours à jour, zéro maintenance** : les fiches lisent les JSON du
  [Codex](https://github.com/Reptile-New/wocc-knowledge-base). Sur
  laclauderie.fr ils sont servis par le domaine lui-même (`/data/`, copiés par
  le déploiement — voir « Mise en ligne ») ; ailleurs (dev local) ils sont lus
  directement sur le GitHub Pages du Codex. Le Codex
  se régénère tout seul à chaque release du jeu. Rien à copier, rien à
  synchroniser.
- Le script est inclus sur toutes les pages ; la fiche s'ouvre au-dessus des
  modales existantes, avec navigation interne (une fiche peut mener à une
  autre, bouton « ← » pour revenir) et un lien « Fiche complète dans le
  Codex » quand elle existe là-bas.

> **Rappel automatique** : le workflow `.github/workflows/check-game-version.yml`
> vérifie toutes les heures si une nouvelle version du jeu est sortie. Si ses
> nouveautés manquent sur le site, il ouvre une issue sur le repo pour le
> signaler (une seule par version). C'est un filet de secours : la rédaction
> elle-même est normalement assurée par la Routine Claude (voir `CLAUDE.md`).

## Gérer le calendrier, les membres et les faits d'armes (pour les officiers)

Tout se fait depuis **`admin.html`** (lien « Espace officiers » en bas du site),
avec des formulaires simples — **aucun code à toucher** : les events du
calendrier, les rôles de guilde (création, renommage, suppression), les membres
(pseudo, classe, un ou plusieurs rôles à cocher), et les faits d'armes en
cochant les membres participants. Le classement serveur, lui, est relevé
automatiquement toutes les 3 h par `update-guild-rank.yml`.

> Les events passés ne disparaissent plus : ils restent visibles sur l'accueil
> dans la section « Événements passés », pour montrer l'activité de la guilde.

### Créer sa clé d'accès (une fois, ~2 min)

L'espace officiers demande un **jeton GitHub fine-grained** pour pouvoir
enregistrer les changements :

1. [github.com → Fine-grained token](https://github.com/settings/personal-access-tokens/new)
   (connecté au compte qui a accès au repo).
2. **Repository access** → *Only select repositories* → **La-Clauderie**.
3. **Permissions** → *Repository* → **Contents** → **Read and write**.
4. Générer, copier le jeton, le coller dans l'espace officiers.

La clé est mémorisée sur l'appareil (option « rester connecté »). Chaque
modification est enregistrée dans le fichier JSON correspondant (`events.json`,
`members.json` ou `achievements.json`) et **le site se met à jour tout seul en
~1 min**.

## Mise en ligne

Le site vit à **<https://laclauderie.fr>** (domaine + hébergement web 100 Mo
chez OVH) — et nulle part ailleurs. Un seul workflow,
`.github/workflows/deploy.yml`, le publie à chaque push sur `main` : il vérifie
d'abord le site, puis l'envoie par FTP.

| Job de `deploy.yml` | Rôle |
|---|---|
| `checks` | appelle `check-site.yml` et bloque la publication si le site est cassé |
| `ovh` | envoie **laclauderie.fr** (FTP simple — le serveur OVH refuse le FTPS explicite, vérifié le 19/07/2026) |

> **Il n'y a plus de miroir.** Le site était aussi publié sur GitHub Pages en
> secours ; ce miroir a été retiré le 6 août 2026. Depuis que tout l'art du jeu
> est embarqué, l'artefact pèse ~17 Mo et GitHub Pages dépassait régulièrement
> les 10 minutes que `actions/deploy-pages` accorde au maximum : 2 publications
> sur 3 échouaient. Un secours indisponible deux fois sur trois n'en est pas
> un. Si OVH tombe, le site tombe — c'est assumé. Le job `pages` reste
> récupérable dans l'historique de `deploy.yml` si l'envie revient.

Les mises à jour faites depuis l'espace officiers arrivent donc sur
laclauderie.fr toutes seules, comme avant (~1 à 2 min).

### Le Codex sur laclauderie.fr/codex/

Le **Codex WoCC** reste développé dans son propre repo
([wocc-knowledge-base](https://github.com/Reptile-New/wocc-knowledge-base)),
mais il est **servi sur le domaine** : cliquer « 📚 Codex » dans la barre de
navigation reste sur <https://laclauderie.fr/codex/>, sans détour par GitHub.
Concrètement, le job `ovh` de `deploy.yml` embarque à chaque passage une copie
du repo du Codex (public) : sa page sous `www/codex/` et ses données JSON sous
`www/data/`. Comme le Codex se met à jour tout seul à chaque release du jeu,
le workflow tourne aussi périodiquement (toutes les 6 h) pour rafraîchir la
copie. Un lancement manuel (**Actions → Publier le site → Run workflow**) la
rafraîchit immédiatement si besoin. En dev local, les liens « Codex » sont
repointés automatiquement (par `assets/codex-popup.js`) vers l'adresse du
Codex propre à cet environnement.

### Configuration OVH (une seule fois)

Le déploiement OVH a besoin des identifiants FTP de l'hébergement, stockés en
secrets du repo :

1. [Espace client OVH](https://www.ovh.com/manager/) → **Web Cloud →
   Hébergements → laclauderie.fr → onglet FTP-SSH** : noter l'**adresse du
   serveur FTP** (ex. `ftp.cluster0XX.hosting.ovh.net`) et l'**identifiant
   principal** ; définir le **mot de passe FTP** (« Modifier le mot de
   passe ») si ce n'est pas déjà fait.
2. Sur GitHub : **Settings → Secrets and variables → Actions → New repository
   secret**, créer les trois secrets :
   - `OVH_FTP_SERVER` — l'adresse du serveur FTP
   - `OVH_FTP_USERNAME` — l'identifiant principal
   - `OVH_FTP_PASSWORD` — le mot de passe FTP
3. Lancer un premier déploiement : onglet **Actions → « Deploy La Clauderie
   sur OVH » → Run workflow** (ou pousser n'importe quel changement sur
   `main`).

> **HTTPS** : le certificat Let's Encrypt est généré automatiquement par OVH
> (visible dans l'onglet « Informations générales » de l'hébergement). Le
> fichier `.htaccess` du site redirige ensuite `http://` et `www.` vers
> `https://laclauderie.fr`.

## Installer le site comme une app

Le site est une **PWA** : sur téléphone comme sur ordinateur, il s'ajoute à
l'écran d'accueil et s'ouvre en plein écran, sans barre de navigateur.

- **Android / Chrome / Edge** : une pastille « 📲 Installer l'app » apparaît en
  bas de page (ou menu ⋮ → « Installer l'application »).
- **iPhone / iPad** : Apple ne donne pas de bouton — Safari → Partager →
  « Sur l'écran d'accueil ». La pastille rappelle la manip.
- La pastille se ferme définitivement avec le ✕ (mémorisé dans le navigateur).

Sous le capot :

| Fichier | Rôle |
|---|---|
| `manifest.json` | Nom, icônes, couleurs, raccourcis (Builds, Métiers, PvP, Nouveautés) |
| `sw.js` | Service worker **réseau d'abord** : jamais de contenu périmé tant que le réseau répond, et le site s'ouvre quand même hors ligne (dernière visite en cache). Pour repartir d'un cache propre chez tout le monde : incrémenter `CACHE` en tête du fichier |
| `assets/pwa.js` | Enregistre le service worker et affiche la pastille d'installation |
| `assets/icon-*.png` | Icônes 192/512/maskable/apple-touch, générées par `python3 scripts/make_icons.py` (même blason que le favicon) |

Chaque page charge ces deux lignes dans son `<head>` (chemins relatifs, `../`
depuis `notes/`) : `<link rel="manifest" …>` et `<script src="…/assets/pwa.js" defer>`.
Une nouvelle page créée en copiant une page existante les emporte donc avec elle.

## Liens

- 🌐 Site : <https://laclauderie.fr>
- 🎮 Jeu : <https://worldofclaudecraft.com/>
- 💬 Discord officiel de World of ClaudeCraft (salon **#france**) : <https://discord.gg/C2W4Ta2ssC>
  — la guilde n'a pas (encore) de Discord attitré, on se retrouve là-bas
- 📚 Codex WoCC : <https://github.com/Reptile-New/wocc-knowledge-base>
