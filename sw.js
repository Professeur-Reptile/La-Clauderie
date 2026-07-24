/* ============================================================================
   Service worker du site de La Clauderie.
   ----------------------------------------------------------------------------
   Deux rôles :
     1. rendre le site installable (« Ajouter à l'écran d'accueil ») ;
     2. garder une copie de secours pour que l'app s'ouvre hors ligne.

   Stratégie : RÉSEAU D'ABORD, cache en secours. Le site bouge tout le temps
   (BiS recalculé, classement, nouvelles versions) — on ne sert jamais du vieux
   contenu tant que le réseau répond. Le cache ne sert qu'en cas de coupure.

   Pour forcer tous les visiteurs à repartir d'un cache propre : bump CACHE.
   ============================================================================ */
'use strict';

var CACHE = 'clauderie-v1';

// Le minimum pour que l'app s'ouvre hors ligne. Le reste se met en cache
// tout seul au fil de la navigation.
var SHELL = [
  './',
  './index.html',
  './patch-notes.json',
  './assets/nav.js',
  './assets/lang.js',
  './assets/version.js',
  './assets/codex-popup.js',
  './assets/icon-192.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // Un fichier manquant ne doit pas faire échouer toute l'installation.
      return Promise.all(SHELL.map(function (u) {
        return c.add(u).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        return k === CACHE ? null : caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== location.origin) return;   // Discord, images externes… : on laisse passer

  e.respondWith(
    fetch(req).then(function (res) {
      if (res && res.ok && res.type === 'basic') {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        if (hit) return hit;
        // Page jamais visitée + hors ligne : on retombe sur l'accueil.
        if (req.mode === 'navigate') return caches.match('./index.html');
        return Response.error();
      });
    })
  );
});
