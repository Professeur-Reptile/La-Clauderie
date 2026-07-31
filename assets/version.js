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
     - kbTag  : data/_meta.json de la knowledge base — écrit par l'extraction
                automatique (cron 5 min), donc la vraie dernière version DÉTECTÉE
                du jeu, presque toujours en avance sur la Routine éditoriale.
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

  Promise.all([
    safeJson(root + 'patch-notes.json'),
    safeJson(KB_META_URL)
  ]).then(function (results) {
    var notesData = results[0], kbMeta = results[1];
    var notesV = notesData && notesData.versions && notesData.versions[0] && notesData.versions[0].version;
    var kbTag = kbMeta && kbMeta.tag;
    render(notesV || null, kbTag || null);
  });
})();
