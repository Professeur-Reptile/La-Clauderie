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
  // sûrs. Sans condition de mode : dans un navigateur classique les insets
  // valent 0, donc rien ne bouge — et iOS ne matche pas toujours
  // (display-mode: standalone) en mode app, ce qui annulait le correctif.
  // Nécessite, dans CHAQUE page : viewport-fit=cover dans la balise viewport
  // ET apple-mobile-web-app-status-bar-style en « black-translucent » — seul
  // mode où iOS rapporte les vrais insets (en « black », il dessine quand même
  // bord à bord mais renvoie safe-area-inset-top = 0).
  if (!document.getElementById('pwa-safe-area')) {
    var safe = document.createElement('style');
    safe.id = 'pwa-safe-area';
    safe.textContent =
      '.topbar, .guild-bar { padding-top: env(safe-area-inset-top, 0px); }' +
      ' body { padding-bottom: env(safe-area-inset-bottom, 0px); }' +
      // La vraie cause du « haut coupé » sur mobile : chaque page fige la barre
      // à height:56px (une ligne d'onglets) alors qu'en étroit les onglets
      // passent sur 2-3 lignes — align-items:center faisait déborder la 1re
      // ligne AU-DESSUS du haut de page. Corrigé dans le CSS des pages
      // (min-height) ; répété ici pour tout HTML pas encore rafraîchi.
      ' .topbar .row, .gb-row { height: auto; min-height: 56px;' +
      ' padding-top: 8px; padding-bottom: 8px; }';
    document.head.appendChild(safe);
  }

  // Filet de secours : iOS renvoie parfois safe-area-inset-top = 0 en mode app
  // alors que la page est dessinée bord à bord (régressions connues, ex. iOS 26
  // — WebKit #301994). Quand ça arrive, la règle env() ci-dessus ne fait rien :
  // on MESURE donc la situation réelle et on applique une hauteur forfaitaire
  // selon l'appareil. Même bloc dans nav.js (pour le Codex) — un seul s'active
  // grâce au verrou window.__safeAreaFallback.
  if (!window.__safeAreaFallback) {
    window.__safeAreaFallback = true;
    (function () {
      var appMode = navigator.standalone === true ||
        (window.matchMedia &&
          (matchMedia('(display-mode: standalone)').matches ||
           matchMedia('(display-mode: fullscreen)').matches));
      var iOS = /iP(hone|ad|od)/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      if (!appMode || !iOS) return;

      function insetReel() {   // ce que env() donne VRAIMENT, mesuré au pixel
        var p = document.createElement('div');
        p.style.cssText = 'position:fixed;top:0;left:0;width:1px;visibility:hidden;' +
          'pointer-events:none;height:env(safe-area-inset-top,0px)';
        (document.body || document.documentElement).appendChild(p);
        var h = p.getBoundingClientRect().height;
        p.remove();
        return h;
      }
      function hauteurBarre() {   // hauteur de la barre d'état par appareil (px CSS)
        var h = Math.max(screen.width, screen.height);
        var t = { 812: 48, 844: 47, 852: 59, 874: 62, 896: 48, 912: 62, 926: 47, 932: 59, 956: 62 };
        return t[h] || (h >= 800 ? 54 : 20);
      }
      var style = null;
      function ajuste() {
        var portrait = window.innerHeight >= window.innerWidth;
        var bordABord = window.innerHeight >= screen.height - 1;  // la page couvre tout l'écran
        var besoin = portrait && bordABord && insetReel() === 0;
        if (besoin && !style) {
          style = document.createElement('style');
          style.id = 'pwa-safe-area-fallback';
          style.textContent = '.topbar, .guild-bar { padding-top: ' + hauteurBarre() + 'px; }';
          document.head.appendChild(style);
        } else if (!besoin && style) {
          style.remove();
          style = null;
        }
      }
      ajuste();
      window.addEventListener('resize', ajuste);
      window.addEventListener('orientationchange', ajuste);
    })();
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
