const CACHE_VERSION = 'v4';
const CACHE_NAME = `memory-${CACHE_VERSION}`;
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/auth.js',
  '/utils.js',
  '/game.js',
  '/admin.js',
  '/i18n.js',
  '/audio.js',
  '/lobby-rooms.js',
  '/lobby-profile.js',
  '/lobby-leaderboard.js',
  '/lobby-chat.js',
  '/lobby-bot.js',
  '/lobby-suggest.js',
  '/file-picker.js',
  '/icons/favicon-192.png',
  '/icons/favicon-512.png',
  '/sounds/click.mp3',
  '/sounds/tile.mp3',
  '/sounds/tile-closed.mp3',
  '/sounds/win.mp3',
  '/sounds/lose.mp3',
  '/sounds/match.mp3',
  '/sounds/combo.mp3',
  '/manifest.json'
];

const NETWORK_FIRST = ['/api/', '/socket.io/'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k.startsWith('memory-') && k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;

  if (NETWORK_FIRST.some(path => url.includes(path))) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then(cachedResponse => {
      const fetchPromise = fetch(e.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(e.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
