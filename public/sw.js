const CACHE_VERSION = 'v8';
const CACHE_NAME = `memory-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

// Минимальный pre-cache: только критичный app shell (не JS — он в бандле)
const PRECACHE_ASSETS = [
    '/offline.html',
    '/manifest.json',
    '/icons/favicon-192.png',
    '/icons/favicon-512.png',
];

// Никогда не кэшируем API и socket.io
const NETWORK_ONLY_PREFIXES = ['/api/', '/socket.io/'];

// Хэшированные ресурсы (*.min.js, *.min.css) — кэш-навсегда
function isImmutable(url) {
    return /\.[a-f0-9]{8}\.min\.(js|css)(\?.*)?$/.test(url.pathname);
}

// Звуки и иконки — долгосрочный кэш
function isLongLived(url) {
    return /\.(mp3|ogg|wav|png|ico|webp|svg|jpg)(\?.*)?$/.test(url.pathname);
}

function isNetworkOnly(url) {
    return NETWORK_ONLY_PREFIXES.some(p => url.pathname.startsWith(p));
}

// ── Install: pre-cache app shell ──────────────────────────────────────────────
self.addEventListener('install', e => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(PRECACHE_ASSETS))
            .catch(() => {})
    );
});

// ── Activate: вычищаем старые кэши ───────────────────────────────────────────
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys
                    .filter(k => k.startsWith('memory-') && k !== CACHE_NAME)
                    .map(k => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

// ── Fetch: трёхуровневая стратегия кэширования ───────────────────────────────
self.addEventListener('fetch', e => {
    const { request } = e;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);

    // 1. Network-only: API и Socket.IO никогда не кэшируем
    if (isNetworkOnly(url)) {
        e.respondWith(
            fetch(request).catch(() =>
                new Response(JSON.stringify({ error: 'offline' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                })
            )
        );
        return;
    }

    // 2. Cache-first: хэшированные бандлы (immutable — кэш = правда)
    if (isImmutable(url)) {
        e.respondWith(
            caches.open(CACHE_NAME).then(cache =>
                cache.match(request).then(cached => {
                    if (cached) return cached;
                    return fetch(request).then(res => {
                        if (res.ok) cache.put(request, res.clone());
                        return res;
                    }).catch(() => new Response('Offline', { status: 503 }));
                })
            )
        );
        return;
    }

    // 3. Network-first: HTML-навигация (всегда свежий контент)
    if (request.mode === 'navigate') {
        e.respondWith(
            fetch(request)
                .then(res => {
                    if (res.ok) {
                        caches.open(CACHE_NAME).then(c => c.put(request, res.clone()));
                    }
                    return res;
                })
                .catch(() =>
                    caches.open(CACHE_NAME)
                        .then(c => c.match(request))
                        .then(cached => cached || caches.match(OFFLINE_URL))
                )
        );
        return;
    }

    // 4. Stale-while-revalidate: звуки, иконки, CSS без хэша (dev mode)
    e.respondWith(
        caches.open(CACHE_NAME).then(cache =>
            cache.match(request).then(cached => {
                const networkFetch = fetch(request).then(res => {
                    if (res && res.status === 200 && res.type !== 'opaque') {
                        cache.put(request, res.clone());
                    }
                    return res;
                }).catch(() => cached || new Response('Offline', { status: 503 }));

                // Возвращаем кэш сразу + обновляем в фоне (stale-while-revalidate)
                return cached || networkFetch;
            })
        )
    );
});

// ── Message: принудительное обновление ───────────────────────────────────────
self.addEventListener('message', e => {
    if (e.data === 'skipWaiting') self.skipWaiting();
});
