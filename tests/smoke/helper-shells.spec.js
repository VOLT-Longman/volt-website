const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// 도우미 도구 섹션의 틀(내비게이션 → 섹션 → 마운트 요소)이 한국어·영어, 375 · 1440 px에서
// 콘솔 오류와 CSP 위반 없이 열리는지 본다. 화면 내용 자체는 화면별 테스트가 맡는다.
// 계약: docs/helper-tools.md

const STRICT_CSP = [
    "default-src 'self'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self' https://forms.gle",
    "img-src 'self' data: https:", "script-src 'self' https://static.cloudflareinsights.com", "style-src 'self'",
    "connect-src 'self' https://cloudflareinsights.com", "font-src 'self' data:", "object-src 'none'",
].join('; ');

// 섹션 id, 들어 있는 데스크톱 묶음, 마운트 요소, 메뉴 글자, 제목 글자.
const NEW_SECTIONS = [
    { id: 'routes', menu: 'trade', mount: 'routes-app', ko: ['무역 경로', '무역 경로'], en: ['Trade Routes', 'Trade Routes'] },
    { id: 'market', menu: 'trade', mount: 'market-app', ko: ['시세', '시세'], en: ['Prices', 'Prices'] },
    { id: 'missions', menu: 'work', mount: 'missions-app', ko: ['임무', '임무 찾기'], en: ['Missions', 'Mission Finder'] },
    { id: 'fabricator', menu: 'work', mount: 'fabricator-app', ko: ['제작', '제작'], en: ['Crafting', 'Crafting'] },
];
// 기존 섹션도 계속 메뉴에서 열려야 한다.
const KEPT_SECTIONS = [
    { id: 'trade-planner', menu: 'trade' },
    { id: 'mining', menu: 'work', mount: 'mining-app' },
];

async function prepare(page) {
    const problems = [];
    await page.route('**/*', async (route) => {
        if (route.request().resourceType() !== 'document') return route.fallback();
        const response = await route.fetch();
        await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': STRICT_CSP } });
    });
    await mockApi(page, { fleet: true });
    await page.addInitScript(() => {
        window.__cspViolations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
            window.__cspViolations.push(`${event.violatedDirective} <- ${event.blockedURI || 'inline'}`);
        });
    });
    page.on('console', (message) => { if (message.type() === 'error') problems.push(message.text()); });
    page.on('pageerror', (error) => problems.push(String(error)));
    page.on('response', (response) => { if (response.status() >= 400) problems.push(`${response.status()} ${response.url()}`); });
    return {
        async collect() {
            return [...problems, ...(await page.evaluate(() => window.__cspViolations || []))];
        },
    };
}

async function openFromNavigation(page, width, section) {
    if (width >= 1201) {
        await page.locator(`#nav-${section.menu}-toggle`).click();
        await expect(page.locator(`#nav-${section.menu}-menu`)).toBeVisible();
        await page.locator(`#nav-${section.menu}-menu a[href="#${section.id}"]`).click();
        await expect(page.locator(`#nav-${section.menu}-menu`)).toBeHidden();
        await expect(page.locator(`#nav-${section.menu}-toggle`)).toHaveClass(/nav-active/);
    } else {
        await page.locator('#hamburger').click();
        await expect(page.locator('#mobileMenu')).toHaveClass(/active/);
        const link = page.locator(`#mobileMenu a[href="#${section.id}"]`);
        await link.scrollIntoViewIfNeeded();
        await link.click();
        await expect(page.locator('#mobileMenu')).not.toHaveClass(/active/);
    }
    await expect(page.locator(`section#${section.id}`)).toHaveClass(/active/);
    await expect(page).toHaveURL(new RegExp(`#${section.id}$`));
}

async function expectNoSidewaysScroll(page) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, '가로 스크롤이 없어야 함').toBeLessThanOrEqual(1);
}

for (const lang of ['ko', 'en']) {
    for (const width of [375, 1440]) {
        test(`도우미 도구 섹션이 메뉴에서 열린다 (${lang}, ${width}px)`, async ({ page }) => {
            test.setTimeout(60000);
            await page.setViewportSize({ width, height: width === 375 ? 812 : 900 });
            const tracker = await prepare(page);
            await gotoSection(page, `?lang=${lang}`);

            for (const section of NEW_SECTIONS) {
                await openFromNavigation(page, width, section);
                const [menuLabel, heading] = section[lang];
                await expect(page.locator(`section#${section.id} .section-header h2`)).toHaveText(heading);
                await expect(page.locator(`section#${section.id} .section-header p`)).not.toBeEmpty();
                const mount = page.locator(`#${section.mount}`);
                await expect(mount).toBeVisible();
                await expect(mount).not.toBeEmpty();
                await expect(page).toHaveTitle(new RegExp(`^${menuLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} \\| `));
                await expectNoSidewaysScroll(page);
            }
            for (const section of KEPT_SECTIONS) {
                await openFromNavigation(page, width, section);
                if (section.mount) await expect(page.locator(`#${section.mount}`)).not.toBeEmpty();
                await expectNoSidewaysScroll(page);
            }
            expect(await tracker.collect()).toEqual([]);
        });
    }
}

test('모바일 메뉴: 도구 묶음은 두 칸이고 누를 자리는 44px 이상', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await mockApi(page, { fleet: true });
    await gotoSection(page, '?lang=en');
    await page.locator('#hamburger').click();
    await expect(page.locator('#mobileMenu')).toHaveClass(/active/);
    const boxes = await page.locator('#mobileMenu .mobile-menu-half a').evaluateAll((links) => links.map((link) => {
        const rect = link.getBoundingClientRect();
        return { left: Math.round(rect.left), width: rect.width, height: rect.height, clipped: link.scrollWidth > link.clientWidth + 1 };
    }));
    expect(boxes).toHaveLength(8);
    expect(new Set(boxes.map((box) => box.left)).size).toBe(2);
    for (const box of boxes) {
        expect(box.height).toBeGreaterThanOrEqual(44);
        expect(box.clipped).toBe(false);
    }
    // 메뉴가 들어오는 움직임이 끝난 뒤에 잰다.
    await expect.poll(() => page.locator('#mobileMenu .mobile-menu-scroll').evaluate((node) => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
});

test('주소의 화면 값(#section?key=value)이 화면 모듈에 전달되고, 언어 변경도 전달된다', async ({ page }) => {
    await mockApi(page, { fleet: true });
    await page.addInitScript(() => { window.__helperCalls = []; });
    await gotoSection(page, '?lang=ko#routes?from=a&sys=stanton%2C-pyro');
    await expect(page.locator('section#routes')).toHaveClass(/active/);
    await expect(page.locator('#routes-app')).not.toBeEmpty();

    const result = await page.evaluate(async () => {
        const H = window.VOLT_HELPER;
        const calls = [];
        // 계약대로 만든 가짜 화면 모듈을 아직 열지 않은 섹션에 끼워 넣는다.
        window.VOLT_TOURS = {
            init(mount, ctx) { calls.push(['init', mount.id, ctx.section, ctx.lang, ctx.params]); mount.textContent = 'tours ready'; },
            onLanguageChange(lang) { calls.push(['lang', lang]); },
            onRoute(params) { calls.push(['route', params]); },
        };
        window.location.hash = '#tours?stops=3';
        await new Promise((resolve) => setTimeout(resolve, 100));
        window.location.hash = '#tours?stops=4&mix=1';
        await new Promise((resolve) => setTimeout(resolve, 100));
        window.VOLT_I18N.setLang('en');
        await new Promise((resolve) => setTimeout(resolve, 50));
        const chips = H.chips(H.readHash('tours').none || 'stanton,-pyro');
        H.writeHash('tours', { stops: 5 });
        return {
            calls,
            title: document.title,
            routesParams: H.parseHash('#routes?from=a&sys=stanton%2C-pyro').params,
            built: H.buildHash('market', { c: 12, empty: '', q: 'a b' }),
            share: H.shareUrl('routes', { from: 'a' }),
            written: window.location.hash,
            chipStates: [chips.get('stanton'), chips.get('pyro'), chips.get('nyx'), chips.test(['stanton']), chips.test(['pyro', 'stanton']), chips.test(['nyx']), chips.cycle('nyx'), chips.encode()],
            cacheVersion: H.CACHE_VERSION,
        };
    });
    expect(result.calls).toEqual([
        ['init', 'tours-app', 'tours', 'ko', { stops: '3', tab: 'tour' }],
        ['route', { stops: '4', mix: '1', tab: 'tour' }],
        ['lang', 'en'],
    ]);
    expect(result.title).toMatch(/^Trade Routes \| /);
    expect(result.routesParams).toEqual({ from: 'a', sys: 'stanton,-pyro' });
    expect(result.built).toBe('#market?c=12&q=a+b');
    expect(result.share).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/#routes\?from=a$/);
    expect(result.written).toBe('#routes?stops=5&tab=tour');
    expect(result.chipStates).toEqual(['include', 'exclude', 'any', true, false, false, 'include', 'nyx,stanton,-pyro']);
    expect(result.cacheVersion).toMatch(/^20\d{6}-\d{2}$/);
    await expect(page.locator('#tours-app')).toHaveText('tours ready');
});

test('공용 도우미: 모르는 값은 0이 아니고, 가격 나이와 UEX 실패 종류를 구분한다', async ({ page }) => {
    await mockApi(page, { fleet: true });
    const dataRequests = [];
    page.on('request', (request) => { if (request.url().includes('/data/trade/cargo.json')) dataRequests.push(request.url()); });
    await page.route('**/api/uex/market', (route) => route.fulfill({ status: 401, json: { error: 'login' } }));
    await page.route('**/api/uex/terminals', (route) => route.fulfill({ status: 403, json: { error: 'role' } }));
    await page.route('**/api/uex/refineries', (route) => route.fulfill({ status: 503, json: { error: 'down' } }));
    await page.route('**/api/uex/commodities', (route) => route.fulfill({ status: 502, json: { error: 'bad' } }));
    await page.route('**/api/uex/vehicle-prices', (route) => route.fulfill({
        json: { status: 'ok', data: { terminals: {}, vehicles: [] }, meta: { source: 'uex', stale: true, fetchedAt: '2026-11-19T00:00:00Z' } },
    }));
    await gotoSection(page, '?lang=ko#market');

    const result = await page.evaluate(async () => {
        const H = window.VOLT_HELPER;
        const now = Date.UTC(2026, 10, 19, 12, 0, 0);
        const at = (hours) => now / 1000 - hours * 3600;
        const failure = async (path) => {
            try {
                await H.uex(path);
                return 'ok';
            } catch (error) {
                return [H.errorType(error), H.errorText(error)];
            }
        };
        const vehicles = await H.uex('vehicle-prices');
        const cargo = await H.loadJson('/data/trade/cargo.json');
        await H.loadJson('/data/trade/cargo.json');
        const state = window.VOLT_TRADE_ENGINE.state;
        const seen = [];
        const stop = state.subscribe((value) => seen.push(value.ship));
        state.set({ ship: 'hull-c', budget: 500000 });
        stop();
        const stored = JSON.parse(localStorage.getItem(window.VOLT_TRADE_ENGINE.STATE_KEY));
        state.reset();
        return {
            ko: [H.num(null), H.num(0), H.price(undefined), H.price(12500), H.scu(null), H.scu(46), H.name({ en: 'Gold', ko: '금' }), H.name({ en: 'Gold' }),
                H.age(at(0.5), now), H.age(at(5), now), H.age(at(80), now), H.age(null, now), H.duration(4800), H.esc('<b a="1">&\'')],
            levels: [H.ageLevel(at(71), undefined, now), H.ageLevel(at(73), undefined, now), H.ageLevel(at(73), 7, now), H.ageLevel(0, 3, now)],
            source: H.sourceLine({ gameVersion: '4.10.200.58746', builtAt: '2026-11-19T01:02:03Z' }),
            failures: [await failure('market'), await failure('terminals'), await failure('refineries'), await failure('commodities'), await failure('../auth/me')],
            vehicles: [vehicles.stale, Array.isArray(vehicles.data.vehicles)],
            cargoShips: Array.isArray(cargo.ships),
            badData: await H.loadJson('/api/uex/market').then(() => 'ok', (error) => H.errorType(error)),
            defaultAge: [H.DEFAULT_PRICE_AGE_DAYS, state.defaults.maxAgeDays],
            seen, stored: [stored.ship, stored.budget, stored.maxAgeDays], afterReset: state.get().ship,
        };
    });
    expect(result.ko).toEqual(['게임 자료에 없음', '0', '보고 없음', '12,500 aUEC', '게임 자료에 없음', '46 SCU', '금', 'Gold',
        '30분 전', '5시간 전', '3일 전', '보고 시각 모름', '1시간 20분', '&lt;b a=&quot;1&quot;&gt;&amp;&#39;']);
    expect(result.levels).toEqual(['ok', 'old', 'ok', 'unknown']);
    expect(result.source).toBe('자료: 게임 파일 · 게임 버전 4.10.200.58746 · 정리한 날 2026-11-19');
    expect(result.failures.map((item) => item[0])).toEqual(['login', 'member', 'unavailable', 'invalid', 'invalid']);
    expect(result.failures[0][1]).toBe('가격을 보려면 로그인이 필요합니다.');
    expect(result.vehicles).toEqual([true, true]);
    expect(result.cargoShips).toBe(true);
    expect(result.badData).toBe('data');
    expect(result.defaultAge).toEqual([3, 3]);
    expect(result.seen).toEqual(['hull-c']);
    expect(result.stored).toEqual(['hull-c', 500000, 3]);
    expect(result.afterReset).toBeNull();
    // /data 는 immutable 캐시이므로 캐시 버전을 붙여 한 번만 받는다.
    expect(dataRequests).toHaveLength(1);
    expect(dataRequests[0]).toMatch(/\/data\/trade\/cargo\.json\?v=20\d{6}-\d{2}$/);
});

// ── 도구끼리 오가는 길 ────────────────────────────────────────────────────
// 각 도구 섹션 제목 아래 "함께 보기" 줄(index.html)과, 화면이 서로 보내는 주소가 정말 그 화면을 여는지 본다.
for (const lang of ['ko', 'en']) {
    for (const width of [390, 1440]) {
        test(`합친 화면의 예전 주소와 탭 이동 (${lang}, ${width}px)`, async ({ page }) => {
            await page.setViewportSize({ width, height: 900 });
            const tracker = await prepare(page);
            for (const [legacy, canonical, section, next, target] of [
                ['#tours', '#routes?tab=tour', 'tours', '#routes', 'routes'],
                ['#tours?tab=mix', '#routes?tab=mix', 'tours', '#routes', 'routes'],
                ['#hauling', '#missions?tab=hauling', 'hauling', '#missions?tab=rank', 'missions'],
            ]) {
                await gotoSection(page, `?lang=${lang}${legacy}`);
                await expect.poll(() => page.evaluate(() => location.hash)).toBe(canonical);
                const pane = page.locator(`section#${section}.active`);
                const link = pane.locator(`a[href="${next}"]`).first();
                await expect(link).toBeVisible();
                expect((await link.boundingBox()).height).toBeGreaterThanOrEqual(44);
                await link.click();
                await expect(page.locator(`section#${target}`)).toHaveClass(/active/);
                await expectNoSidewaysScroll(page);
            }
            expect(await tracker.collect()).toEqual([]);
        });
    }
}

test('이어 가기: 임무 → 설계도 → 재료 → 캐는 곳 → 정제소, 설계도 → 임무, 광물 → 시세', async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await prepare(page);
    const meta = { source: 'uex', cached: true, ttlSeconds: 1800, fetchedAt: new Date().toISOString() };
    const now = Math.floor(Date.now() / 1000);
    // 채광 화면의 "시세 보기"는 UEX 상품 이름으로 잇는다. 금 하나만 답한다.
    await page.route('**/api/uex/commodities', (route) => route.fulfill({ json: { status: 'ok', meta, data: [{ id: 30, name: 'Gold', code: 'GOLD', kind: 'Metal', is_illegal: 0, price_sell: 6000 }] } }));
    await page.route('**/api/uex/market**', (route) => route.fulfill({ json: { status: 'ok', meta, data: [{ t: 12, c: 30, sell: 6000, box: [1, 2, 4, 8], at: now - 3600 }] } }));
    await page.route('**/api/uex/terminals**', (route) => route.fulfill({ json: { status: 'ok', meta, data: [
        { id: 12, type: 'commodity', name: 'TDD - Area 18', nick: 'TDD Area 18', code: 'TDA18', live: true, system: 'Stanton', planet: 'ArcCorp', cityId: 1, city: 'Area 18', flags: ['autoLoad', 'freightElevator'], maxBox: 32 },
    ] } }));

    // 임무 → 설계도
    await gotoSection(page, '?lang=ko#missions?flag=bp');
    await page.locator('#missions-app [data-ms-open]').first().click();
    const detail = page.locator('#missions-app .missions-detail');
    await expect(detail).toBeVisible();
    const missionId = await detail.getAttribute('data-ms-detail');
    const bpLink = detail.locator('a[href^="#fabricator?bp="]').first();
    const bpName = (await bpLink.textContent()).trim();
    const bpHash = await bpLink.getAttribute('href');
    await bpLink.click();
    await expect(page.locator('section#fabricator')).toHaveClass(/active/);
    await expect(page.locator('#fab-detail-title')).toHaveText(bpName);
    expect(await page.evaluate(() => window.location.hash)).toBe(bpHash);

    // 설계도 → 이 설계도를 주는 임무 (누른 임무가 그 목록에 있어야 한다)
    await page.locator('#fabricator-app [data-act="missions"]').first().click();
    const back = page.locator(`#fabricator-app a.fab-link[href="#missions?m=${missionId}"]`).first();
    await expect(back).toBeVisible();

    // 설계도 → 재료 → 캐는 곳 (함선으로 캐서 정제하는 광물이 나올 때까지 재료를 차례로 눌러 본다)
    const mineHashes = await page.locator('#fabricator-app .fab-detail a.fab-link[href^="#mining?m="]').evaluateAll((nodes) => [...new Set(nodes.map((node) => node.getAttribute('href')))]);
    expect(mineHashes.length).toBeGreaterThan(0);
    let refined = false;
    for (const mineHash of mineHashes) {
        await page.locator(`#fabricator-app .fab-detail a.fab-link[href="${mineHash}"]`).first().click();
        await expect(page.locator('section#mining')).toHaveClass(/active/);
        await expect(page.locator('#mining-detail-title')).toBeVisible();
        expect(await page.evaluate(() => window.VOLT_HELPER.readHash('mining').m)).toBe(decodeURIComponent(mineHash.split('m=')[1]));
        if (await page.locator('#mining-refine-go').count()) { refined = true; break; }
        await page.goBack();
        await expect(page.locator('section#fabricator')).toHaveClass(/active/);
        await expect(page.locator('#fab-detail-title')).toHaveText(bpName);
    }
    // 캐는 곳 → 정제소
    if (!refined) {
        await gotoSection(page, '?lang=ko#mining?m=Ore_Gold');
        await expect(page.locator('#mining-detail-title')).toBeVisible();
    }
    await page.locator('#mining-refine-go').click();
    await expect(page.locator('#mining-view-ref')).toHaveAttribute('aria-selected', 'true');

    // 광물 → 시세
    await gotoSection(page, '?lang=ko#mining?m=Ore_Gold');
    const priceLink = page.locator('#mining-app a.mining-link[href="#market?c=30"]').first();
    await expect(priceLink).toBeVisible();
    await priceLink.click();
    await expect(page.locator('section#market')).toHaveClass(/active/);
    await expect(page.locator('#market-app .market-tab.is-active[data-k="tab-prices"]')).toBeVisible();
    await expect(page.locator('#market-app .market-detailhead h3')).toBeVisible();

    // 설계도 → 임무 (주소로 바로)
    await gotoSection(page, `?lang=ko${bpHash}`);
    await expect(page.locator('#fab-detail-title')).toHaveText(bpName);
    const awarding = page.locator(`#fabricator-app a.fab-link[href="#missions?m=${missionId}"]`).first();
    // 임무 자료는 한 번 받으면 남아 있다. 아직 없을 때만 "임무 보기"를 누른다.
    if (!(await awarding.count())) await page.locator('#fabricator-app [data-act="missions"]').first().click();
    await awarding.click();
    await expect(page.locator('section#missions')).toHaveClass(/active/);
    await expect(page.locator(`#missions-app .missions-detail[data-ms-detail="${missionId}"]`)).toBeVisible();
    expect(await tracker.collect()).toEqual([]);
});

test('이어 가기: 무역 경로 ↔ 시세 · 거래소 ↔ 순회 무역', async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await prepare(page);
    const meta = { source: 'uex', cached: true, ttlSeconds: 1800, fetchedAt: new Date().toISOString() };
    const at = Math.floor(Date.now() / 1000) - 2 * 3600;
    const boxes = [1, 2, 4, 8, 16, 24, 32];
    const terminals = [
        { id: 1, type: 'commodity', name: 'Admin - ARC-L1', nick: 'ARC-L1', code: 'ARCL1', live: true, system: 'Stanton', planet: 'ArcCorp', stationId: 1, station: 'ARC-L1 Wide Forest Station', flags: ['autoLoad', 'freightElevator'], maxBox: 32 },
        { id: 12, type: 'commodity', name: 'TDD - Area 18', nick: 'TDD Area 18', code: 'TDA18', live: true, system: 'Stanton', planet: 'ArcCorp', cityId: 1, city: 'Area 18', flags: ['autoLoad', 'freightElevator'], maxBox: 32 },
    ];
    const market = [
        { t: 1, c: 47, buy: 7000, stock: 500, sb: 5, box: boxes, at }, { t: 12, c: 47, sell: 8500, box: boxes, at },
        { t: 12, c: 70, buy: 4000, stock: 200, sb: 4, box: boxes, at }, { t: 1, c: 70, sell: 5300, box: boxes, at },
    ];
    const commodities = [{ id: 47, name: 'Laranite', code: 'LARA', kind: 'Metal', is_illegal: 0 }, { id: 70, name: 'Stims', code: 'STIM', kind: 'Vice', is_illegal: 0 }];
    await page.route('**/api/uex/market**', (route) => route.fulfill({ json: { status: 'ok', data: market, meta } }));
    await page.route('**/api/uex/terminals**', (route) => route.fulfill({ json: { status: 'ok', data: terminals, meta } }));
    await page.route('**/api/uex/commodities', (route) => route.fulfill({ json: { status: 'ok', data: commodities, meta } }));
    await page.addInitScript(() => {
        if (!window.localStorage.getItem('volt-helper-state-v1')) window.localStorage.setItem('volt-helper-state-v1', JSON.stringify({ v: 1, ship: 'c2-hercules', budget: null, system: null, maxAgeDays: 3, time: {}, boxes: null }));
    });
    const hash = () => page.evaluate(() => window.location.hash);
    const openRoute = async () => {
        await gotoSection(page, '?lang=ko#routes?from=1&to=12');
        await expect(page.locator('#routes-detail')).toBeVisible();
    };

    // 한 경로의 함선, 상품, 터미널, 수량을 플래너로 보낸다.
    await openRoute();
    const transfer = page.locator('#routes-detail [data-act="planner"]').first();
    const amount = await transfer.getAttribute('data-quantity');
    await transfer.click();
    await expect(page.locator('#trade-planner')).toHaveClass(/active/);
    await expect(page.locator('#journey-quantity')).toHaveValue(amount);
    // 무역 경로 → 상품 시세
    await openRoute();
    await page.locator('#routes-detail a[href="#market?c=47&tab=prices"]').first().click();
    await expect(page.locator('section#market')).toHaveClass(/active/);
    await expect(page.locator('#market-app .market-tab.is-active[data-k="tab-prices"]')).toBeVisible();
    await expect(page.locator('#market-app .market-detailhead h3')).toContainText(/라라나이트|Laranite/);

    // 상품 시세 → 무역 경로 (추천 경로 줄)
    const toRoute = page.locator('#market-app a[href^="#routes?"][href*="from=1"][href*="to=12"]').first();
    await expect(toRoute).toBeVisible();
    await toRoute.click();
    await expect(page.locator('section#routes')).toHaveClass(/active/);
    await expect(page.locator('#routes-detail')).toBeVisible();

    // 무역 경로 → 거래소 한 곳
    await openRoute();
    await page.locator('#routes-detail a[href="#market?t=12&tab=stations"]').first().click();
    await expect(page.locator('section#market')).toHaveClass(/active/);
    await expect(page.locator('#market-app .market-tab.is-active[data-k="tab-stations"]')).toBeVisible();
    await expect(page.locator('#market-app .market-detailhead h3')).toBeVisible();

    // 무역 경로 → 순회 무역 (같은 두 곳의 계획)
    await openRoute();
    await page.locator('#routes-detail a[href^="#routes?stops="]').first().click();
    await expect(page.locator('section#tours')).toHaveClass(/active/);
    expect(decodeURIComponent(await hash())).toContain('stops=1,12');
    await expect(page.locator('#tours-app .tours-detail-head')).toBeVisible();

    // 순회 무역 → 무역 경로, 순회 무역 → 거래소
    const legToRoute = page.locator('#tours-app a.tours-link[href^="#routes?"]').first();
    await expect(legToRoute).toBeVisible();
    await legToRoute.click();
    await expect(page.locator('section#routes')).toHaveClass(/active/);
    await expect(page.locator('#routes-detail')).toBeVisible();
    await page.goBack();
    await expect(page.locator('section#tours')).toHaveClass(/active/);
    await page.locator('#tours-app a.tours-link[href^="#market?"]').first().click();
    await expect(page.locator('section#market')).toHaveClass(/active/);
    await expect(page.locator('#market-app .market-tab.is-active[data-k="tab-stations"]')).toBeVisible();

    // 함선: 무역 경로의 "함선 DB로 이동"은 함선 DB 를 연다.
    await openRoute();
    const shipButton = page.locator('#routes-app [data-volt-open="ship"]').first();
    if (await shipButton.count()) {
        await page.locator('#routes-context-title').click();
        await shipButton.click();
        await expect(page.locator('section#ships')).toHaveClass(/active/);
    }
    expect(await tracker.collect()).toEqual([]);
});

test('첫 화면과 관계없는 섹션은 도구 자료를 받지 않는다', async ({ page }) => {
    test.setTimeout(90000);
    const requests = [];
    page.on('request', (request) => requests.push(new URL(request.url()).pathname));
    await mockApi(page, { fleet: true });
    await gotoSection(page, '?lang=ko');
    for (const section of ['about', 'ships', 'loadout', 'gear', 'trade-planner', 'hub', 'guide', 'notices', 'schedule', 'gallery', 'leadership', 'timeline', 'faq', 'policy', 'join', 'hauling']) {
        await page.evaluate((id) => { window.location.hash = `#${id}`; }, section);
        await expect(page.locator(`section#${section}`)).toHaveClass(/active/);
        await page.waitForTimeout(250);
    }
    await page.waitForLoadState('networkidle');
    // 새 도구가 쓰는 자료 파일과 UEX 주소. 이 섹션들에서는 하나도 나가면 안 된다.
    const helperOnly = requests.filter((path) => /^\/data\/(trade|crafting)\//.test(path) || path === '/data/contracts/missions.json'
        || /^\/api\/uex\/(market|terminals|refineries|vehicle-prices|price-history)/.test(path));
    expect(helperOnly).toEqual([]);
    // 도구를 열면 그때 받는다 (잰 방법이 맞는지 확인).
    await page.evaluate(() => { window.location.hash = '#routes'; });
    await expect(page.locator('section#routes')).toHaveClass(/active/);
    await expect.poll(() => requests.filter((path) => path === '/data/trade/cargo.json').length).toBe(1);
});

test('커뮤니티 공개 중에도 새 화면은 함대원 역할을 확인하고 자료 요청 전에 멈춘다', async ({ page }) => {
    const assets = [];
    page.on('request', (request) => {
        if (/\/data\/(?:trade\/|contracts\/missions|crafting\/blueprints|mining\/helper)/.test(request.url())) assets.push(request.url());
    });
    for (const loggedIn of [false, true]) {
        await mockApi(page, { loggedIn, community: true, fleet: false });
        await page.goto('about:blank');
        for (const section of ['market', 'routes', 'missions', 'fabricator', 'mining', 'tours', 'hauling']) {
            await gotoSection(page, '#' + section);
            const gate = page.locator('section.active .helper-access');
            await expect(gate).toContainText(loggedIn ? '함대원 역할이 필요합니다' : '함대원 전용 기능입니다');
            await expect(gate.getByRole('link')).toHaveCount(loggedIn ? 0 : 1);
        }
    }
    expect(assets).toEqual([]);
});

test('운송 계약에서 화물선 크기를 확인하고 함선DB에서 고른 함선으로 경로를 찾는다', async ({ page }) => {
    await prepare(page);
    await gotoSection(page, '#hauling');
    const cargo = page.locator('.hauling-link').first();
    const cargoHash = await cargo.getAttribute('href');
    await cargo.click();
    await expect(page).toHaveURL((url) => url.hash === cargoHash);
    const ships = page.locator('[data-k="contract-ship"]');
    await expect(ships).toBeVisible();
    await expect.poll(() => ships.locator('option').count()).toBeGreaterThan(1);
    await gotoSection(page, '#ships');
    await page.locator('#ship-search').fill('C2 Hercules');
    await page.locator('[data-ship-id="c2-hercules"] .ship-name-btn').click();
    await page.locator('#global-modal [data-volt-open="routes"]').click();
    await expect(page.locator('#routes-context-title')).toContainText('696 SCU');
    await expect(page.locator('#routes-ship')).toHaveValue('c2-hercules');
    await expect(page.locator('#global-modal')).not.toHaveClass(/active/);
});
