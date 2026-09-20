/* SilverCare sw.js — офлайн для APK (pwabuilder) + GitHub Pages.
   Кэширует оболочку old.html/css/js и последнее meds.
   МЕНЯЙ ВЕРСИЮ при любом изменении оболочки, иначе залёживается кэш! */
var CACHE = 'silvercare-v6'; // МЕНЯЙ версию при любом изменении оболочки, иначе залёживается кэш!
var SHELL = ['old.html', 'old.css', 'old.js', 'manifest.json', 'icon-192.png', 'icon-512.png'];

self.addEventListener('install', function (e) {
  try {
    e.waitUntil(
      caches.open(CACHE).then(function (c) { return c.addAll(SHELL); })
        .then(function () { return self.skipWaiting(); }).catch(function () {})
    );
  } catch (err) {}
});

self.addEventListener('activate', function (e) {
  try {
    e.waitUntil(
      caches.keys().then(function (keys) {
        return Promise.all(keys.map(function (k) {
          try { if (k !== CACHE) return caches.delete(k); } catch (err) {}
          return Promise.resolve(true);
        }));
      }).then(function () { return self.clients.claim(); }).catch(function () {})
    );
  } catch (err) {}
});

self.addEventListener('notificationclick', function (e) {
  try { // тап по шторке: открыть приложение, кнопка "Я ВЫПИЛ" — погасить аларм
    e.notification.close();
    e.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
        try {
          for (var i = 0; i < list.length; i++) {
            try { if ('focus' in list[i]) list[i].focus(); } catch (err) {}
            try { if (e.action === 'taken') list[i].postMessage('silver-taken'); } catch (err) {}
          }
          if (list.length) return null;
          if (self.clients.openWindow) return self.clients.openWindow('old.html');
        } catch (err) {}
        return null;
      }).catch(function () {})
    );
  } catch (err) {}
});
self.addEventListener('fetch', function (e) {
  try {
    var url = e.request.url || '';
    if (e.request.method !== 'GET') return; // PUT/POST в ящик — только сеть, кэш их не умеет
    // ntfy и CDN голоса — всегда сеть, без кэша
    if (url.indexOf('ntfy.sh') !== -1 || url.indexOf('catbox.moe') !== -1) {
      e.respondWith(fetch(e.request).catch(function () {
        return new Response('[]', { headers: { 'Content-Type': 'application/json' } });
      }));
      return;
    }
    // оболочка: сначала кэш, потом сеть (офлайн первым делом)
    e.respondWith(
      caches.match(e.request, { ignoreSearch: false }).then(function (hit) {
        if (hit) return hit;
        return fetch(e.request).then(function (res) {
          try {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) {
              try { c.put(e.request, copy); } catch (err) {}
            }).catch(function () {});
          } catch (err) {}
          return res;
        }).catch(function () {
          return caches.match('old.html');
        });
      })
    );
  } catch (err) {}
});
self.addEventListener('push', function (e) {
  try { // системный пуш от бота: долетает с закрытым приложением
    var d = {};
    try { d = e.data ? e.data.json() : {}; } catch (err) {}
    var opts = { body: (d.body || ''), tag: (d.tag || 'silver-push'), requireInteraction: true, renotify: true, vibrate: [1000, 500, 1000] };
    try { if (d.actions) opts.actions = d.actions; } catch (err) {}
    e.waitUntil(self.registration.showNotification((d.title || 'Время пить лекарство!'), opts).catch(function () {}));
  } catch (err) {}
});
