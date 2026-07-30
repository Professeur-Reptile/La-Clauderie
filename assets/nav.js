/* ============================================================================
   Barre de navigation du site — SOURCE DE VÉRITÉ UNIQUE des onglets.
   ----------------------------------------------------------------------------
   Toutes les pages (accueil, Builds, Métiers, Nouveautés, notes/…) ET la page
   Codex (repo wocc-knowledge-base, servie sous /codex/) partagent CETTE liste.
   Pour ajouter/renommer/réordonner un onglet : on modifie UNIQUEMENT ce fichier,
   et tout le site se met à jour. Fini les barres recopiées à la main qui
   partent en vrille dès qu'on ajoute une page.

   Utilisation dans une page :
     <nav class="topnav" data-guild-nav data-current="bis"></nav>   (site principal)
     <nav class="gb-nav" data-guild-nav data-current="codex"></nav> (Codex)
     <script src="assets/nav.js"></script>   (chemin adapté selon la page)
   L'attribut data-current = l'id de l'onglet actif (voir TABS ci-dessous).
   La langue est lue dans localStorage (clé « lang »), partagée avec lang.js et
   le Codex ; un bouton FR/EN déjà présent dans la barre est préservé.
   ============================================================================ */
(function () {
  'use strict';

  // ---- Les onglets, dans l'ordre d'affichage. LA seule liste à maintenir. ----
  var TABS = [
    { id: 'home',    file: 'index.html',       fr: 'Accueil',       en: 'Home' },
    { id: 'bis',     file: 'bis.html',         fr: '⚔️ Builds',      en: '⚔️ Builds' },
    { id: 'metiers', file: 'metiers.html',     fr: '🌿 Métiers',     en: '🌿 Professions' },
    { id: 'pvp',     file: 'pvp.html',         fr: '🏆 PvP',         en: '🏆 PvP' },
    { id: 'failles', file: 'failles.html',     fr: '🌀 Failles',     en: '🌀 Rifts' },
    { id: 'montures',file: 'montures.html',    fr: '🐎 Montures',    en: '🐎 Mounts' },
    { id: 'news',    file: 'patch-notes.html', fr: '📜 Nouveautés',  en: "📜 What's new" },
    { id: 'codex',   file: null,               fr: '📚 Codex',       en: '📚 Codex' }
  ];

  var lang = (localStorage.getItem('lang') === 'en') ? 'en' : 'fr';
  var path = location.pathname;
  var host = location.hostname;

  var onDomain = /(^|\.)laclauderie\.fr$/.test(host);   // servi à la racine du domaine
  var inCodex  = /\/codex(\/|$)/.test(path) || /wocc-knowledge-base/.test(path);
  var inNotes  = /\/notes\//.test(path);

  // Racine du site de la guilde (là où vivent index/bis/metiers/patch-notes).
  var root = inCodex ? (onDomain ? '/' : '/La-Clauderie/')
           : inNotes ? '../'
           : '';

  // Le Codex n'est copié sous /codex/ que sur laclauderie.fr. Ailleurs (miroir
  // GitHub Pages du site, dev local), on pointe directement le Codex là où il
  // vit — sans dépendre du repointage de codex-popup.js, absent de certaines
  // pages futures.
  var onLocal = /^(localhost|127\.|0\.0\.0\.0)/.test(host);
  var codexHref = onDomain ? '/codex/'
    : onLocal ? '/wocc-knowledge-base/site/index.html'
    : 'https://reptile-new.github.io/wocc-knowledge-base/site/index.html';

  function hrefFor(tab) {
    if (tab.id === 'codex') return inCodex ? null : codexHref;
    if (tab.id === 'home')  return inCodex ? root : (root + 'index.html');
    return root + tab.file;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  document.querySelectorAll('[data-guild-nav]').forEach(function (nav) {
    var current = nav.getAttribute('data-current') || '';
    // On préserve un éventuel bouton de langue déjà présent dans la barre
    // (le Codex en a un en dur ; sur le site principal, lang.js l'ajoute après).
    var langBtn = nav.querySelector('.lang-btn');

    var html = TABS.map(function (t) {
      var label = esc(lang === 'en' ? t.en : t.fr);
      var href = hrefFor(t);
      if (t.id === current || href === null) {
        return '<span class="cur gb-cur">' + label + '</span>';
      }
      return '<a href="' + esc(href) + '">' + label + '</a>';
    }).join('\n      ');

    nav.innerHTML = html;
    if (langBtn) nav.appendChild(langBtn);   // on le remet à la fin
  });
})();
