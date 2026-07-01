/**
 * VOLT Service Worker
 * CACHE_VERSION is updated during deployment so browsers refresh cached assets.
 */

const CACHE_VERSION = '20260614-29';
const CACHE_NAME = `volt-cache-${CACHE_VERSION}`;

// index.html에서 ?v= 버전 쿼리를 붙여 로드하는 에셋.
// 프리캐시 키가 실제 요청 URL과 일치하도록 버전 쿼리를 함께 캐시한다.
const VERSIONED_ASSETS = [
    '/css/styles.css',
    '/js/theme-init.js',
    '/js/i18n.js',
    '/js/navigation.js',
    '/js/uex.js',
    '/js/uex-panel.js',
    '/js/trade-planner.js',
    '/js/ships.js',
    '/js/search-modal.js',
    '/js/main.js',
    '/js/volt-ai.js',
    '/data/volt-data.js',
    '/data/volt-localization.js',
    '/data/ship-en.js',
];

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/404.html',
    '/manifest.json',
    ...VERSIONED_ASSETS.map((assetPath) => `${assetPath}?v=${CACHE_VERSION}`),
    '/assets/images/VOLT_logo.webp',
    '/assets/images/streamers/perma.png',
    '/assets/images/streamers/kookbap.png',
    '/assets/images/streamers/rudy.webp',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET' || url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) return;

    const isHTML = request.headers.get('accept')?.includes('text/html');

    if (isHTML) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    return response;
                })
                .catch(() => caches.match(request))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then((cached) => {
            if (cached) return cached;
            return fetch(request).then((response) => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                }
                return response;
            });
        })
    );
});
