/**
 * VOLT Service Worker
 * 배포 시 CACHE_VERSION을 날짜 기반으로 갱신하면 브라우저가 새 SW를 감지해
 * 구버전 캐시를 자동 삭제하고 최신 CSS/JS를 적용합니다.
 */

const CACHE_VERSION = '20260517';
const CACHE_NAME = `volt-cache-${CACHE_VERSION}`;

const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/main.js',
    '/data/volt-data.js',
    '/assets/images/VOLT_logo.png',
    '/assets/images/streamers/perma.png',
    '/assets/images/streamers/kookbap.png',
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

    const isHTML = request.headers.get('accept')?.includes('text/html');

    if (isHTML) {
        // HTML: 네트워크 우선, 실패 시 캐시 fallback
        event.respondWith(
            fetch(request)
                .then((response) => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    return response;
                })
                .catch(() => caches.match(request))
        );
    } else {
        // 정적 에셋: 캐시 우선, 없으면 네트워크 후 캐시 저장
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
    }
});
