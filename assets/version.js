/* ============================================================================
   Badge « à jour de la version » — pages de contenu (Builds, PvP, Métiers).
   ----------------------------------------------------------------------------
   Chaque page déclare la version du jeu pour laquelle son contenu a été
   vérifié via l'attribut data-version de SA balise d'inclusion :

       <script src="assets/version.js" data-version="v0.28.0" defer></script>

   Le script croise TROIS sources pour ne jamais affirmer à tort « c'est la
   dernière version du jeu » :
     - pageV  : la version pour laquelle CETTE page a été relue (data-version) ;
     - notesV : la dernière entrée de patch-notes.json — tenue par la Routine
                éditoriale (horaire), donc en léger retard possible sur le jeu ;
     - kbTag  : la vraie dernière version du jeu, prise au PLUS FRAIS de trois
                miroirs (voir latestGameTag) : la copie locale de
                data/_meta.json (rafraîchie au déploiement, jusqu'à 6 h de
                retard sur OVH), le _meta.json des GitHub Pages de la KB
                (quelques minutes de retard), et l'API GitHub du repo du jeu
                (la release réelle, cache local de 10 min pour ménager le
                quota anonyme). Incident du 4 août 2026 : le badge affichait
                « à jour de la v0.33.1 — la dernière version du jeu » alors
                que la v0.34.0 était sortie, parce que le cron de la KB
                (throttlé ~1 h par GitHub) ET la copie OVH étaient en retard
                en même temps — d'où les deux sources fraîches ajoutées.
   Trois badges possibles :
     ✓ vert   — pageV = notesV = kbTag : à jour, et vérifié contre le jeu.
     ⏳ orange (page en retard) — le jeu a avancé (notesV a bougé), la
                relecture de CETTE page est en cours.
     ⏳ orange (MAJ toute fraîche) — kbTag a bougé mais notesV ne le sait pas
                encore : une nouvelle version du jeu vient de sortir, les
                Nouveautés et cette page sont en cours de rédaction — pas
                encore « la dernière version », littéralement pas encore su.

   Qui met à jour data-version ?
     - bis.html     → scripts/inject_bis.py (automatique, avec le recalcul) ;
     - pvp.html, metiers.html, failles.html, montures.html → la Routine
       éditoriale, après relecture (voir CLAUDE.md, procédure « nouvelle MAJ »).
   ============================================================================ */
(function () {
  'use strict';

  var script = document.currentScript;
  var pageV = script && script.getAttribute('data-version');
  if (!pageV) return;

  var lang = (localStorage.getItem('lang') === 'en') ? 'en' : 'fr';
  var root = /\/notes\//.test(location.pathname) ? '../' : '';

  // Même résolution de chemin que assets/codex-popup.js pour data/_meta.json.
  var GH_PAGES = 'https://reptile-new.github.io/wocc-knowledge-base';
  var onLocal = /^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname);
  var onLaclauderie = /(^|\.)laclauderie\.fr$/.test(location.hostname);
  var KB_META_URL = onLaclauderie ? '/data/_meta.json'
    : onLocal ? '/wocc-knowledge-base/data/_meta.json'
    : GH_PAGES + '/data/_meta.json';

  function render(notesV, kbTag) {
    var head = document.querySelector('header.page, header.hero');
    if (!head) return;

    var css = document.createElement('style');
    css.textContent = [
      '.ver-badge { display: inline-flex; align-items: baseline; gap: 6px; margin: 14px 0 0;',
      '  font-family: var(--font-mono, monospace); font-size: 0.74rem; letter-spacing: 0.02em;',
      '  border: 1px solid color-mix(in srgb, var(--heal, #58c46a) 45%, transparent);',
      '  color: var(--heal, #58c46a); border-radius: 7px; padding: 4px 10px; }',
      '.ver-badge b { font-weight: 700; }',
      '.ver-badge.warn { border-color: color-mix(in srgb, var(--gold, #c8a04b) 55%, transparent);',
      '  color: var(--gold-bright, #e6c37a); }',
      '.ver-badge a { color: inherit; }'
    ].join('\n');
    document.head.appendChild(css);

    var el = document.createElement('p');
    el.className = 'ver-badge';
    // Priorité 1 : le jeu a une version connue (kbTag) que la Routine éditoriale
    // n'a pas encore inscrite dans patch-notes.json (notesV) — une MAJ toute
    // fraîche, pas encore documentée nulle part. Ne JAMAIS dire « dernière
    // version » dans ce cas, même si pageV = notesV.
    if (kbTag && notesV && kbTag !== notesV) {
      el.className += ' warn';
      el.innerHTML = (lang === 'en'
        ? '⏳ The game just moved to <b>' + kbTag + '</b> — not yet the version shown here (<b>' + pageV + '</b>). Patch notes and this page are being written, check back shortly. '
        : '⏳ Le jeu vient de passer en <b>' + kbTag + '</b> — pas encore la version affichée ici (<b>' + pageV + '</b>). Les Nouveautés et cette page sont en cours de rédaction, repasse dans un instant. ')
        + '<a href="' + root + 'patch-notes.html">' + (lang === 'en' ? 'See what changed' : 'Voir ce qui a changé') + '</a>';
    } else if (notesV && notesV !== pageV) {
      el.className += ' warn';
      el.innerHTML = (lang === 'en'
        ? '⏳ Checked for <b>' + pageV + '</b> — the game is now on <b>' + notesV + '</b>, review in progress. '
        : '⏳ Page vérifiée pour la <b>' + pageV + '</b> — le jeu est passé en <b>' + notesV + '</b>, relecture en cours. ')
        + '<a href="' + root + 'patch-notes.html">' + (lang === 'en' ? 'See what changed' : 'Voir ce qui a changé') + '</a>';
    } else if (notesV) {
      el.innerHTML = lang === 'en'
        ? '✓ Up to date with <b>' + notesV + '</b> — the latest game version'
        : '✓ À jour de la <b>' + notesV + '</b> — la dernière version du jeu';
    } else {
      // patch-notes.json injoignable : on affiche au moins la version vérifiée.
      el.innerHTML = (lang === 'en' ? 'Content checked for <b>' : 'Contenu vérifié pour la <b>') + pageV + '</b>';
    }
    head.appendChild(el);
  }

  function safeJson(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  // Compare deux tags « vX.Y.Z » numériquement (v0.34.0 > v0.33.1).
  function newerTag(a, b) {
    if (!a) return b; if (!b) return a;
    var pa = String(a).replace(/^v/, '').split('.'), pb = String(b).replace(/^v/, '').split('.');
    for (var i = 0; i < 3; i++) {
      var d = (parseInt(pa[i], 10) || 0) - (parseInt(pb[i], 10) || 0);
      if (d) return d > 0 ? a : b;
    }
    return a;
  }

  // La release réelle du jeu via l'API GitHub, avec un cache de 10 min en
  // sessionStorage : une page vue = au plus un appel, et le quota anonyme
  // (60 req/h/IP) reste très loin.
  function latestReleaseTag() {
    var KEY = 'wocc-latest-tag', TTL = 10 * 60 * 1000;
    try {
      var c = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (c && c.tag && (Date.now() - c.t) < TTL) return Promise.resolve(c.tag);
    } catch (e) { /* stockage indisponible : on interroge sans cache */ }
    return safeJson('https://api.github.com/repos/levy-street/world-of-claudecraft/releases/latest')
      .then(function (rel) {
        var tag = rel && rel.tag_name || null;
        if (tag) { try { sessionStorage.setItem(KEY, JSON.stringify({ tag: tag, t: Date.now() })); } catch (e) {} }
        return tag;
      });
  }

  // Le tag le plus frais parmi les trois miroirs (voir l'en-tête du fichier).
  function latestGameTag() {
    var sources = [safeJson(KB_META_URL), latestReleaseTag()];
    if (onLaclauderie) sources.push(safeJson(GH_PAGES + '/data/_meta.json'));
    return Promise.all(sources).then(function (r) {
      var local = r[0] && r[0].tag, api = r[1], pages = r[2] && r[2].tag;
      return newerTag(newerTag(local, pages), api) || null;
    });
  }

  Promise.all([
    safeJson(root + 'patch-notes.json'),
    latestGameTag()
  ]).then(function (results) {
    var notesData = results[0], kbTag = results[1];
    var notesV = notesData && notesData.versions && notesData.versions[0] && notesData.versions[0].version;
    render(notesV || null, kbTag || null);
  });
})();
