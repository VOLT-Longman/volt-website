/**
 * VOLT Service Worker
 * CACHE_VERSION is updated during deployment so browsers refresh cached assets.
 */

const CACHE_VERSION = '20261124-01';
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
    '/css/motion.css',
    '/css/routes.css',
    '/css/market.css',
    '/css/tours.css',
    '/css/missions.css',
    '/css/fabricator.css',
    '/css/mining-extra.css',
    '/css/starmap.css',
    '/js/motion.js',
    '/js/cinematic-motion.js',
    '/assets/vendor/gsap/gsap.min.js',
    '/assets/vendor/gsap/ScrollTrigger.min.js',
    '/js/theme-init.js',
    '/js/i18n.js',
    '/js/helper-common.js',
    '/js/table-sort.js',
    '/js/navigation.js',
    '/js/notices.js',
    '/js/schedule.js',
    '/js/landing.js',
    '/js/site-content.js',
    '/js/uex.js',
    '/js/uex-panel.js',
    '/js/trade-planner.js',
    '/js/journey-calc.js',
    '/js/trade-engine.js',
    '/js/journey.js',
    '/js/loadout-calc.js',
    '/js/loadout-planner.js',
    '/js/search-render.js',
    '/js/loadout-layout.js',
    '/js/loadout.js',
    '/js/mining.js',
    '/js/gear.js',
    '/js/starmap.js',
    '/js/ships.js',
    '/js/ship-imagery.js',
    '/js/shipdb-manufacturers.js',
    '/js/shipdb-canonical.js',
    '/js/search-modal.js',
    '/js/auth-ui.js',
    '/js/community-access.js',
    '/js/mypage.js',
    '/js/leadership.js',
    '/js/main.js',
    '/js/volt-ai.js',
    '/data/volt-data.js',
    '/data/volt-localization.js',
    // ship-live-stats/ship-market(~500KB)는 함선DB 진입 시 지연 로드가 설계 —
    // install 프리캐시에 넣으면 lazy-load 최적화를 SW가 무효화하므로 제외한다.
    // 멤버 권한 확인이 필요하므로 첫 사용 시에도 네트워크에서만 받는다.
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
    // Ambiguous/encoded aliases must always reach server authorization, even if
    // an older worker once cached a normalized protected asset under that alias.
    if (url.pathname.includes('//') || url.pathname.includes('%') || url.pathname.includes('\\')) return;
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/') || url.pathname.startsWith('/admin')) return;
    // Membership-protected data must always reach the server, including after logout.
    // Activation deletes the old runtime caches that previously stored these files.
    if (url.pathname.startsWith('/data/trade/') || url.pathname.startsWith('/data/crafting/')
        || url.pathname === '/data/mining/helper.json' || url.pathname.startsWith('/data/contracts/')
        || url.pathname.startsWith('/data/canonical/') || url.pathname.startsWith('/data/loadout/')
        || url.pathname === '/data/ship-live-stats.js' || url.pathname === '/data/ship-market.js'
        || url.pathname === '/data/gear/models.json' || url.pathname === '/data/gear/attachments.json'
        || url.pathname.startsWith('/data/starmap/')) return;
    // Range 부분 요청(미션 컨트롤 콘솔의 레이어 헤더 조회)은 SW 우회 —
    // Cache API는 206을 저장하지 못하고, cache-first가 응답을 고정하면 syncedAt이 낡는다.
    if (request.headers.get('range')) return;
    // 개조 화면의 3D 모형·그림(.glb, .webp, .png)은 개수가 많고 크다. 런타임 캐시에 넣으면 80개 한도를
    // 금방 채워 다른 항목을 밀어내고 큰 응답을 한 번 더 복사하게 되므로, 브라우저 HTTP 캐시에 맡긴다.
    if (url.pathname.startsWith('/assets/models/')) return;

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
