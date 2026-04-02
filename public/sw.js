const CACHE_NAME = 'memory';
const ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/auth.js',
  '/lobby.js',
  '/game.js',
  '/admin.js',
  '/i18n.js',
  '/audio.js',
  '/favicon.png',
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

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', e => {
  // Не кэшируем API и Socket.io запросы
  if (e.request.url.includes('/api/') || e.request.url.includes('/socket.io/')) {
    return fetch(e.request);
  }
  
  e.respondWith(
    caches.match(e.request).then(res => res || fetch(e.request))
  );
});