/* ============================================================================
   « Installer l'app » — mode application / écran d'accueil.
   ----------------------------------------------------------------------------
   Une page inclut simplement :
     <link rel="manifest" href="manifest.json">   (« ../manifest.json » dans notes/)
     <script src="assets/pwa.js" defer></script>  (idem, chemin relatif)

   Ce fichier fait deux choses :
     1. enregistre le service worker (`sw.js`, à la racine du site) — chemin
        déduit de son propre src, donc valable aussi bien à la racine du
        domaine que sur le miroir GitHub Pages ou depuis notes/ ;
     2. affiche une pastille discrète « Installer l'app » quand le navigateur
        le permet (Chrome/Edge/Android), ou le mode d'emploi Safari sur iOS
        (Apple ne donne aucun bouton : il faut passer par Partager).

   La pastille ne s'affiche jamais si l'app est déjà installée, ni après un
   refus (mémorisé dans localStorage).
   ============================================================================ */
(function () {
  'use strict';

  var self_src = (document.currentScript && document.currentScript.src) || '';
  var root = self_src.replace(/assets\/pwa\.js.*$/, '');   // racine du site
  var lang = (localStorage.getItem('lang') === 'en') ? 'en' : 'fr';

  // En mode application (écran d'accueil), les téléphones récents dessinent la
  // page SOUS la barre d'état (heure, batterie, réseau) : la barre du site se
  // retrouvait cachée derrière. On réserve la zone système avec les insets
  // sûrs — actif uniquement en mode app, le navigateur classique ne change pas.
  // (Nécessite viewport-fit=cover dans la balise viewport de chaque page.)
  if (!document.getElementById('pwa-safe-area')) {
    var safe = document.createElement('style');
    safe.id = 'pwa-safe-area';
    safe.textContent =
      '@media (display-mode: standalone), (display-mode: fullscreen) {' +
      ' .topbar, .guild-bar { padding-top: env(safe-area-inset-top, 0px); }' +
      ' body { padding-bottom: env(safe-area-inset-bottom, 0px); }' +
      '}';
    document.head.appendChild(safe);
  }

  var T = {
    fr: {
      install: '📲 Installer l\'app',
      ios: '📲 Ajouter à l\'écran d\'accueil',
      how: 'Dans Safari : bouton Partager (carré avec une flèche) → « Sur l\'écran d\'accueil ».',
      close: 'Fermer'
    },
    en: {
      install: '📲 Install app',
      ios: '📲 Add to home screen',
      how: 'In Safari: Share button (square with an arrow) → “Add to Home Screen”.',
      close: 'Close'
    }
  }[lang];

  // ---- 1. Service worker -----------------------------------------------
  if ('serviceWorker' in navigator && root && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register(root + 'sw.js', { scope: root })
        .catch(function () { /* pas installable ici (dev local, sous-dossier…) : tant pis */ });
    });
  }

  // ---- 2. Pastille d'installation ---------------------------------------
  var standalone = window.matchMedia('(display-mode: standalone)').matches ||
                   navigator.standalone === true;
  if (standalone || localStorage.getItem('pwaHide') === '1') return;

  var isIOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
              (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var deferred = null;

  function pill(label, onClick) {
    var box = document.createElement('div');
    box.setAttribute('role', 'dialog');
    box.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);' +
      'bottom:16px;z-index:9999;display:flex;align-items:center;gap:10px;' +
      'max-width:min(92vw,460px);padding:10px 12px;border-radius:999px;' +
      'border:1px solid #c8a04b;background:#161a24;color:#dfe3ea;' +
      'box-shadow:0 8px 24px rgba(0,0,0,.5);font:14px/1.35 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.style.cssText = 'flex:1;cursor:pointer;border:0;border-radius:999px;' +
      'padding:8px 14px;background:#c8a04b;color:#1a130a;font:inherit;font-weight:700;' +
      'white-space:nowrap';
    btn.addEventListener('click', onClick);

    var x = document.createElement('button');
    x.type = 'button';
    x.textContent = '✕';
    x.title = T.close;
    x.setAttribute('aria-label', T.close);
    x.style.cssText = 'cursor:pointer;border:0;background:none;color:#8b93a3;' +
      'font:inherit;padding:4px 6px';
    x.addEventListener('click', function () {
      localStorage.setItem('pwaHide', '1');
      box.remove();
    });

    box.appendChild(btn);
    box.appendChild(x);
    document.body.appendChild(box);
    return box;
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferred = e;
    var box = pill(T.install, function () {
      box.remove();
      deferred.prompt();
      deferred.userChoice.then(function () { deferred = null; });
    });
  });

  window.addEventListener('appinstalled', function () {
    localStorage.setItem('pwaHide', '1');
  });

  // iOS : pas d'événement, pas de bouton natif → on explique la manip.
  if (isIOS) {
    window.addEventListener('load', function () {
      var box = pill(T.ios, function () {
        var p = document.createElement('p');
        p.textContent = T.how;
        p.style.cssText = 'margin:0;padding:0 4px;color:#dfe3ea';
        box.style.borderRadius = '14px';   // plus de pastille ronde : c'est un pavé de texte
        box.replaceChildren(p, box.lastChild);
      });
    });
  }
})();
