/**
 * VOLT Service Worker
 * CACHE_VERSION is updated during deployment so browsers refresh cached assets.
 */

const CACHE_VERSION = '20261010-01';
const CACHE_NAME = `volt-cache-${CACHE_VERSION}`;
const RUNTIME_CACHE_NAME = `volt-runtime-${CACHE_VERSION}`;
const RUNTIME_LIMIT = 80;
const PUBLIC_HTML_PATHS = new Set(['/', '/index.html', '/guide/', '/guide/index.html', '/404.html']);
let cacheWrites = Promise.resolve();

// Serialize writes so concurrent requests cannot grow the runtime cache past its limit.
// Cache failures must never turn a successful network response into a failed request.
function storeRuntime(request, response) {
    cacheWrites = cacheWrites.catch(() => {}).then(async () => {
        const cache = await caches.open(RUNTIME_CACHE_NAME);
        await cache.put(request, response);
        const keys = await cache.keys();
        await Promise.all(keys.slice(0, Math.max(0, keys.length - RUNTIME_LIMIT)).map((key) => cache.delete(key)));
    }).catch(() => {});
    return cacheWrites;
}


// index.html에서 ?v= 버전 쿼리를 붙여 로드하는 에셋.
// 프리캐시 키가 실제 요청 URL과 일치하도록 버전 쿼리를 함께 캐시한다.
const VERSIONED_ASSETS = [
    '/css/styles.css',
    '/js/theme-init.js',
    '/js/i18n.js',
    '/js/navigation.js',
    '/js/notices.js',
    '/js/schedule.js',
    '/js/landing.js',
    '/js/site-content.js',
    '/js/uex.js',
    '/js/uex-panel.js',
    '/js/trade-planner.js',
    '/js/ships.js',
    '/js/shipdb-manufacturers.js',
    '/js/shipdb-canonical.js',
    '/js/search-modal.js',
    '/js/auth-ui.js',
    '/js/mypage.js',
    '/js/leadership.js',
    '/js/main.js',
    '/js/volt-ai.js',
    '/data/volt-data.js',
    '/data/volt-localization.js',
    // ship-live-stats/ship-market(~500KB)는 함선DB 진입 시 지연 로드가 설계 —
    // install 프리캐시에 넣으면 lazy-load 최적화를 SW가 무효화하므로 제외한다.
    // 첫 사용 시 fetch 핸들러의 cache-first가 런타임 캐시에 채운다 (G1).
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
                keys.filter((key) => /^(volt-cache-|volt-runtime-)/.test(key) && key !== CACHE_NAME && key !== RUNTIME_CACHE_NAME).map((key) => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET' || url.origin !== self.location.origin) return;
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/admin')) return;
    // Canonical ShipDB는 manifest hash로 함께 배포된다. 이전 Service Worker의
    // cache-first 응답이 새 manifest와 섞이지 않도록, manifest와 데이터 파일은
    // 네트워크/CDN 캐시에 맡기고 SW 런타임 캐시에서는 제외한다.
    if (url.pathname.startsWith('/data/canonical/')) return;
    // Range 부분 요청(미션 컨트롤 콘솔의 레이어 헤더 조회)은 SW 우회 —
    // Cache API는 206을 저장하지 못하고, cache-first가 응답을 고정하면 syncedAt이 낡는다.
    if (request.headers.get('range')) return;

    const isHTML = request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html');

    if (isHTML) {
        if (!PUBLIC_HTML_PATHS.has(url.pathname)) return;
        // These are public static shells. Notice/tracking queries do not change HTML.
        // Store one offline shell per path instead of one copy for every shared link.
        const key = new Request(url.origin + url.pathname);
        event.respondWith((async () => {
            try {
                const response = await fetch(request);
                if (response.ok && !response.redirected) {
                    const snapshot = response.clone();
                    event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(key, snapshot)).catch(() => {}));
                }
                return response;
            } catch (_error) {
                const cached = await caches.open(CACHE_NAME).then((cache) => cache.match(key)).catch(() => null);
                return cached || new Response('현재 오프라인입니다. 연결 후 다시 시도해 주세요. / You are offline. Please reconnect and try again.', {
                    status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                });
            }
        })());
        return;
    }

    if (!/^\/(?:css|js|data|assets)\//.test(url.pathname) && url.pathname !== '/manifest.json') return;
    event.respondWith((async () => {
        const cached = await caches.open(CACHE_NAME).then((cache) => cache.match(request)).catch(() => null)
            || await caches.open(RUNTIME_CACHE_NAME).then((cache) => cache.match(request)).catch(() => null);
        if (cached) return cached;
        const response = await fetch(request);
        const cacheControl = response.headers.get('cache-control') || '';
        if (response.ok && !response.redirected && !/no-store|private/i.test(cacheControl)) {
            event.waitUntil(storeRuntime(request, response.clone()));
        }
        return response;
    })());
});
