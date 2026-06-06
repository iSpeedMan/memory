const CACHE_VERSION = 'v5';
const CACHE_NAME = `memory-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/offline.html',
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

const NETWORK_ONLY = ['/api/', '/socket.io/'];

self.addEventListener('install', e => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(PRECACHE_ASSETS)).catch(() => {})
    );
});

self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(k => k.startsWith('memory-') && k !== CACHE_NAME).map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', e => {
    const { request } = e;
    const url = new URL(request.url);

    if (request.method !== 'GET') return;

    if (NETWORK_ONLY.some(path => url.pathname.startsWith(path))) {
        e.respondWith(
            fetch(request).catch(() => new Response(JSON.stringify({ error: 'offline' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' }
            }))
        );
        return;
    }

    const isNavigation = request.mode === 'navigate';

    e.respondWith(
        caches.open(CACHE_NAME).then(cache =>
            cache.match(request).then(cached => {
                const networkFetch = fetch(request)
                    .then(response => {
                        if (response && response.status === 200 && response.type !== 'opaque') {
                            cache.put(request, response.clone());
                        }
                        return response;
                    })
                    .catch(() => {
                        if (cached) return cached;
                        if (isNavigation) return caches.match(OFFLINE_URL);
                        return new Response('Offline', { status: 503 });
                    });

                return cached || networkFetch;
            })
        )
    );
});

self.addEventListener('message', e => {
    if (e.data === 'skipWaiting') self.skipWaiting();
});
