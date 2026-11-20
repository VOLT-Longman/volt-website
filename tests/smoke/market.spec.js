const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// 시세 · 거래소 (#market) 화면. /api/uex/* 는 작은 가짜 자료로 대신한다 (개발 서버에는 Functions 가 없다).
// 게임 자료(data/trade/*.json, data/canonical/*.json)는 진짜 파일을 쓴다.
// 터미널 id 12(에어리어 18), 25(에버러스 하버), 466(루인 스테이션)은 world.json 의 게임 위치와 이어지는 진짜 UEX id 다.

const STRICT_CSP = [
    "default-src 'self'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self' https://forms.gle",
    "img-src 'self' data: https:", "script-src 'self' https://static.cloudflareinsights.com", "style-src 'self'",
    "connect-src 'self' https://cloudflareinsights.com", "font-src 'self' data:", "object-src 'none'",
].join('; ');
const STATE_KEY = 'volt-helper-state-v1';
const HULL_A_REF = '6ec72f64-2002-481c-b7c9-b132476ba6aa';

function fixtures() {
    const now = Math.floor(Date.now() / 1000);
    const hour = 3600;
    const day = 86400;
    const boxes = [1, 2, 4, 8, 16];
    return {
        terminals: [
            { id: 12, type: 'commodity', name: 'TDD - Trade and Development Division - Area 18', nick: 'TDD Area 18', code: 'TDA18', live: true, system: 'Stanton', planet: 'ArcCorp', city: 'Area 18', faction: 'United Empire of Earth', flags: ['autoLoad', 'freightElevator'], maxBox: 32 },
            { id: 25, type: 'commodity', name: 'Admin - Everus Harbor', nick: 'Everus Harbor', code: 'EVERU', live: true, system: 'Stanton', planet: 'Hurston', stationId: 10, station: 'Everus Harbor', flags: ['autoLoad', 'freightElevator', 'loadingDock'], maxBox: 32 },
            { id: 466, type: 'commodity', name: 'Admin - Ruin Station', nick: 'Ruin Station', code: 'RUINS', live: true, system: 'Pyro', planet: 'Terminus', stationId: 45, station: 'Ruin Station', flags: ['freightElevator', 'refinery'] },
        ],
        market: [
            { t: 25, c: 5, buy: 300, stock: 500, sb: 5, box: boxes, at: now - 2 * hour },
            { t: 12, c: 5, sell: 380, box: boxes, at: now - day },
            { t: 466, c: 5, sell: 420, inv: 100, ss: 7, box: boxes, at: now - 5 * day },
            { t: 12, c: 1, buy: 2000, stock: 0, sb: 1, box: boxes, at: now - 3 * hour },
            { t: 25, c: 1, buy: 2100, stock: 50, sb: 2, box: boxes, at: now - hour },
            { t: 466, c: 1, sell: 2600, box: boxes, at: now - hour },
            // 오소이안 가죽: 루인 스테이션(파이로)에서는 합법, 에어리어 18(UEE)에서는 금지 품목. 에어리어 18 상점은 가득 찼다고 보고됨.
            { t: 466, c: 53, buy: 1000, stock: 10, sb: 3, box: boxes, at: now - hour },
            { t: 12, c: 53, sell: 5000, inv: 840, ss: 7, box: boxes, at: now - hour },
        ],
        commodities: [
            { id: 5, name: 'Aluminum', code: 'ALUM', kind: 'Metal', is_illegal: 0 },
            { id: 1, name: 'Agricium', code: 'AGRI', kind: 'Metal', is_illegal: 0 },
            { id: 53, name: 'Osoian Hides', code: 'OSOH', kind: 'Natural', is_illegal: 1 },
        ],
        vehicles: {
            terminals: { 149: { name: 'New Deal', place: 'Lorville', system: 'Stanton' } },
            vehicles: [{ id: 102, uuid: HULL_A_REF, name: 'MISC Hull A', buy: [{ t: 149, price: 1615950, at: now - 5 * day }], rent: [{ t: 149, price: 32319, at: now - 2 * day }] }],
        },
        history: [
            { at: now - 3 * day, sell: 370, v: '4.10.3' },
            { at: now - 2 * day, sell: 375, inv: 50, ss: 3, v: '4.10.3' },
            { at: now - day, sell: 380, v: '4.10.3' },
        ],
        // UEX 원본 표 (평균이 들어 있는 통과 엔드포인트)
        rawPrices: [
            { id_terminal: 25, id_commodity: 5, price_buy: 300, price_buy_avg: 250, price_sell: 0, price_sell_avg: 0, date_modified: now - 2 * hour, commodity_name: 'Aluminum', terminal_name: 'Admin - Everus Harbor' },
            { id_terminal: 12, id_commodity: 5, price_buy: 0, price_buy_avg: 0, price_sell: 380, price_sell_avg: 400, date_modified: now - day, commodity_name: 'Aluminum', terminal_name: 'TDD Area 18' },
            { id_terminal: 466, id_commodity: 5, price_buy: 0, price_buy_avg: 0, price_sell: 420, price_sell_avg: 0, date_modified: now - 5 * day, commodity_name: 'Aluminum', terminal_name: 'Admin - Ruin Station' },
        ],
    };
}

const ok = (data) => ({ json: { status: 'ok', data, meta: { source: 'uex', cached: true, ttlSeconds: 1800, fetchedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString() } } });

// extra: { terminals, market } 를 기본 가짜 자료에 더한다. namesStatus: /api/uex/commodities 의 응답 코드.
async function prepare(page, { state = null, marketStatus = 200, namesStatus = 200, extra = null } = {}) {
    const problems = [];
    const data = fixtures();
    if (extra) {
        data.terminals.push(...(extra.terminals || []));
        data.market.push(...(extra.market || []));
    }
    await page.route('**/*', async (route) => {
        if (route.request().resourceType() !== 'document') return route.fallback();
        const response = await route.fetch();
        await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': STRICT_CSP } });
    });
    await mockApi(page, { fleet: true });
    await page.route('**/api/uex/market**', (route) => (marketStatus === 200 ? route.fulfill(ok(data.market)) : route.fulfill({ status: marketStatus, json: { error: 'no' } })));
    await page.route('**/api/uex/terminals', (route) => route.fulfill(ok(data.terminals)));
    await page.route('**/api/uex/commodities', (route) => (namesStatus === 200 ? route.fulfill(ok(data.commodities)) : route.fulfill({ status: namesStatus, json: { error: 'no' } })));
    await page.route('**/api/uex/vehicle-prices', (route) => route.fulfill(ok(data.vehicles)));
    await page.route('**/api/uex/price-history**', (route) => route.fulfill(ok(data.history)));
    await page.route(/\/api\/uex\/commodities\/\d+\/prices/, (route) => route.fulfill(ok(data.rawPrices)));
    await page.route('**/api/uex/location-prices**', (route) => route.fulfill(ok(data.rawPrices.filter((row) => row.id_terminal === 12))));
    await page.addInitScript(([key, value]) => {
        window.__cspViolations = [];
        document.addEventListener('securitypolicyviolation', (event) => window.__cspViolations.push(`${event.violatedDirective} <- ${event.blockedURI || 'inline'}`));
        try {
            if (value && !sessionStorage.getItem('market-test-seeded')) {
                localStorage.setItem(key, JSON.stringify(value));
                sessionStorage.setItem('market-test-seeded', '1');
            }
        } catch (_error) { /* 저장소를 못 쓰면 기본값으로 */ }
    }, [STATE_KEY, state]);
    page.on('console', (message) => { if (message.type() === 'error') problems.push(message.text()); });
    page.on('pageerror', (error) => problems.push(String(error)));
    return {
        async collect() {
            return [...problems, ...(await page.evaluate(() => window.__cspViolations || []))];
        },
    };
}

async function expectNoSidewaysScroll(page) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, '가로 스크롤이 없어야 함').toBeLessThanOrEqual(1);
}

const app = (page) => page.locator('#market-app');
// 좁은 화면에서는 "내 설정"이 접혀 있다.
async function openSettings(page) {
    const box = app(page).locator('details.market-settings');
    await expect(box).toHaveCount(1);
    if (!(await box.evaluate((node) => node.open))) await box.locator('summary').click();
}
test('시세 표에서 고른 정렬이 카드·주소·기존 선택창에 같이 반영된다', async ({ page }) => {
    await prepare(page);
    await gotoSection(page, '?lang=ko#market');
    const table = page.locator('[data-sort-source="market-prices"]');
    const buy = table.locator('thead th').nth(1);
    await buy.getByRole('button').click();
    await expect(buy).toHaveAttribute('aria-sort', 'ascending');
    await expect(app(page).locator('[data-change="sort"]')).toHaveValue('buy');
    await expect(table.locator('tbody tr').first()).toContainText('300 aUEC');
    await page.setViewportSize({ width: 390, height: 844 });
    const picker = app(page).locator('.volt-sort-mobile select').first();
    await picker.selectOption('1/1');
    await expect(buy).toHaveAttribute('aria-sort', 'descending');
    await expect(page).toHaveURL(/sort=buy-rev/);
    await expect(app(page).locator('[data-change="sort"]')).toHaveValue('buy-rev');
    await expect(table.locator('tbody tr').first()).toContainText('2,100 aUEC');
});
const top = (locator) => locator.evaluate((node) => Math.round(node.getBoundingClientRect().top));
const row = (page, text) => app(page).locator('.market-table tbody tr', { hasText: text });

for (const width of [375, 1440]) {
    test(`상품 시세: 가장 싼 구매처·비싼 판매처·차익과 보고 나이, 출처 표시 (${width}px)`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const tracker = await prepare(page);
        await gotoSection(page, '?lang=ko#market');

        const aluminum = row(page, '알루미늄');
        await expect(aluminum).toContainText('300 aUEC');
        await expect(aluminum).toContainText('에버러스 하버');
        await expect(aluminum).toContainText('2시간 전');
        // 5일 된 420 보고는 기본 기준(3일) 밖이라 쓰지 않는다.
        await expect(aluminum).toContainText('380 aUEC');
        await expect(aluminum).not.toContainText('420');
        await expect(aluminum).toContainText('80 aUEC');
        await expect(app(page)).toContainText('기준보다 오래된 보고 1건은 계산에서 뺐습니다');
        // 품절로 보고된 곳(2,000)은 구매처에서 빠진다.
        await expect(row(page, '아그리슘')).toContainText('2,100 aUEC');

        const source = app(page).locator('[data-market-source]');
        await expect(source).not.toContainText('자료: 게임 파일');
        await expect(source).not.toContainText('게임 버전 4.');
        await expect(source).toContainText('가격·재고: UEX 이용자 보고');
        await expectNoSidewaysScroll(page);

        // 좁은 화면: 내 설정은 접혀 있고 지금 값이 한 줄로 보인다. 넓은 화면에서는 펼쳐져 있다.
        const settings = app(page).locator('details.market-settings');
        expect(await settings.evaluate((node) => node.open)).toBe(false);
        if (width === 375) await expect(settings.locator('summary')).toContainText('3일 이내 가격');
        await openSettings(page);

        // 기준을 7일로 늘리면 420 보고가 들어오고, 값은 공용 저장소에 남는다. 열어 둔 설정은 다시 그려도 열려 있다.
        await openSettings(page);
        await app(page).locator('[data-k="max-age"]').selectOption('7');
        await expect(row(page, '알루미늄')).toContainText('420 aUEC');
        expect(await settings.evaluate((node) => node.open)).toBe(true);
        await expect(app(page)).toContainText('복사한 주소에는 내 함선·쓸 수 있는 돈·가격 보고 기준이 들어가지 않습니다');
        expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).maxAgeDays, STATE_KEY)).toBe(7);

        // 검색: 글자를 쳐도 입력 칸에 초점이 남고, 주소에 q 가 적힌다.
        const search = app(page).locator('[data-k="q"]');
        await search.click();
        await page.keyboard.type('agri');
        await expect(search).toBeFocused();
        await expect(row(page, '알루미늄')).toHaveCount(0);
        await expect(row(page, '아그리슘')).toHaveCount(1);
        await expect(page).toHaveURL(/#market\?q=agri$/);
        expect(await tracker.collect()).toEqual([]);
    });
}

test('상품 하나: 거래소별 표, 오래된 보고 표시, 내 함선 추천 경로, 가격 기록 그래프', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const tracker = await prepare(page, { state: { v: 1, ship: 'hull-a', budget: null, system: null, maxAgeDays: 3, time: {} } });
    await gotoSection(page, '?lang=ko#market');
    // 글쇠로 연다: 목록의 링크가 사라져도 초점은 문서 맨 위가 아니라 본문에 남는다.
    await row(page, '알루미늄').getByRole('link', { name: '알루미늄' }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#market\?c=5$/);
    await expect(app(page).locator('.market-body')).toBeFocused();

    const detail = app(page).locator('[data-market-commodity="5"]');
    await expect(detail.locator('h3')).toHaveText('알루미늄');
    await expect(detail).toContainText('게임 자료상 모든 지역 합법');
    const ruin = detail.locator('tr.is-old');
    await expect(ruin).toHaveCount(1);
    await expect(ruin).toContainText('420 aUEC');
    await expect(ruin).toContainText('기준보다 오래됨');
    await expect(ruin).toContainText('7/7 단계');
    await expect(ruin).toContainText('가득 참');
    // 양을 보고하지 않은 판매처는 0 이 아니라 "모름"으로 보인다.
    await expect(detail.locator('tr', { hasText: '380 aUEC' }).first()).toContainText('얼마나 받아 줄지 모름');

    const routes = detail.locator('[data-market-routes]');
    await expect(routes).toContainText('에버러스 하버');
    await expect(routes).toContainText('64 SCU');
    await expect(routes).toContainText('5,120 aUEC'); // 64 SCU × (380 − 300)
    await expect(routes.locator('a[href="#routes?c=5&from=25&to=12"]')).toHaveCount(1);
    await expect(routes.locator('.market-assume')).toContainText('이 계산이 가정한 것');
    await expect(routes).not.toContainText('불법');
    // "이 계산이 가정한 것"을 열어 두면 다시 그려도 열려 있다.
    await routes.locator('.market-assume summary').click();
    await openSettings(page);
    await app(page).locator('[data-k="max-age"]').selectOption('7');
    await expect(detail.locator('tr.is-old')).toHaveCount(0);
    expect(await routes.locator('.market-assume').evaluate((node) => node.open)).toBe(true);
    await openSettings(page);
    await app(page).locator('[data-k="max-age"]').selectOption('3');
    await expect(detail.locator('tr.is-old')).toHaveCount(1);

    // 가격 기록: 버튼 → 그래프(점 3개) + 표, 주소에 ht/hc. 닫으면 버튼으로 초점이 돌아온다.
    await detail.locator('[data-k="h-12-5"]').click();
    await expect(page).toHaveURL(/#market\?c=5&hc=5&ht=12$/);
    const history = detail.locator('[data-market-history]');
    // 기록은 누른 줄 바로 아래에 열린다.
    await expect(detail.locator('tr:has([data-k="h-12-5"]) + tr.market-historyrow [data-market-history]')).toHaveCount(1);
    await expect(history.locator('svg.market-chart .market-chart-dot')).toHaveCount(3);
    await expect(history.locator('svg.market-chart')).toHaveAttribute('aria-label', /보고 3건 · 최저 370 aUEC · 최고 380 aUEC/);
    await expect(history).toContainText('지금 게임 버전의 보고만');
    await expect(history.locator('.market-table tbody tr')).toHaveCount(3);
    await expect(history.locator('[data-k="history-close"]')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(detail.locator('[data-market-history]')).toHaveCount(0);
    await expect(detail.locator('[data-k="h-12-5"]')).toBeFocused();
    expect(await tracker.collect()).toEqual([]);
});

test('함선을 고르지 않으면 경로 자리에 안내가 나오고, 고르면 계산된다', async ({ page }) => {
    await prepare(page);
    await gotoSection(page, '?lang=ko#market?c=5');
    const routes = app(page).locator('[data-market-routes]');
    await expect(routes).toContainText('"내 함선"을 고르면');
    await openSettings(page);
    await app(page).locator('[data-k="my-ship"]').selectOption('hull-a');
    await expect(routes).toContainText('5,120 aUEC');
    // 돈이 모자라면 살 수 있는 만큼만: 3,000 aUEC ÷ 300 = 10 SCU 까지, 상자로는 8 + 2
    await openSettings(page);
    await app(page).locator('[data-k="my-money"]').fill('3000');
    await app(page).locator('[data-k="my-money"]').press('Tab');
    await expect(routes).toContainText('10 SCU');
});

for (const width of [375, 1440]) {
    test(`거래소: 목록·시설 조건·한 곳 정보·여기에 있어요 (${width}px)`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const tracker = await prepare(page, { state: { v: 1, ship: 'hull-a', budget: null, system: null, maxAgeDays: 3, time: {} } });
        await gotoSection(page, '?lang=ko#market?tab=stations');
        await expect(app(page).locator('.market-table tbody tr')).toHaveCount(3);
        await app(page).locator('[data-k="fac-refinery"]').click();
        await expect(app(page).locator('[data-k="fac-refinery"]')).toHaveAttribute('aria-pressed', 'true');
        await expect(app(page).locator('.market-table tbody tr')).toHaveCount(1);
        await expect(app(page).locator('.market-table tbody tr')).toContainText('보고 없음'); // 가장 큰 상자를 모르는 곳
        await expect(page).toHaveURL(/fac=refinery/);
        await app(page).locator('[data-k="fac-refinery"]').click();
        await expectNoSidewaysScroll(page);

        await app(page).locator('[data-k="t-12"]').click();
        await expect(page).toHaveURL(/#market\?t=12&tab=stations$/);
        const sheet = app(page).locator('[data-market-station="12"]');
        await expect(sheet.locator('h3')).toContainText('에어리어 18');
        await expect(sheet.locator('.market-traits')).toContainText('32 SCU');
        await expect(sheet.locator('.market-flags li', { hasText: '화물 엘리베이터' })).toContainText('있음');
        await expect(sheet.locator('.market-flags li', { hasText: '정제소' })).toContainText('보고 없음');
        await expect(sheet).toContainText('게임 자료의 시설');
        await expect(sheet.locator('tr', { hasText: '아그리슘' })).toContainText('품절로 보고됨');
        await expect(sheet.locator('tr', { hasText: '알루미늄' })).toContainText('1일 전');
        await expectNoSidewaysScroll(page);

        await sheet.locator('[data-k="here"]').click();
        await expect(page).toHaveURL(/#routes\?from=12$/);
        expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).system, STATE_KEY)).toBe('Stanton');
        expect(await tracker.collect()).toEqual([]);
    });
}

test('시세 변동: 지금 가격과 UEX 15일 평균을 기간과 함께 보여 준다', async ({ page }) => {
    const tracker = await prepare(page);
    await gotoSection(page, '?lang=ko#market?tab=movers&c=5');
    await expect(app(page)).toContainText('최근 15일 동안의 보고로 계산한 값');
    const movers = app(page).locator('[data-market-movers]');
    await expect(movers.locator('thead')).toContainText('15일 평균 (UEX)');
    const rows = movers.locator('tbody tr');
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(0)).toContainText('+20%');       // 300 대 250
    await expect(rows.nth(0)).toContainText('평균보다 높음');
    await expect(rows.nth(1)).toContainText('-5%');        // 380 대 400
    await expect(rows.nth(1)).toContainText('평균보다 낮음');
    await expect(rows.nth(2)).toContainText('평균 없음 (15일 안 보고 없음)');
    await expect(rows.nth(2)).toContainText('기준보다 오래됨');

    // 거래소를 고르면 그 거래소의 표를 받아 온다.
    await app(page).locator('[data-k="movers-t"]').selectOption('12');
    await expect(page).toHaveURL(/#market\?t=12&tab=movers$/);
    await expect(app(page).locator('[data-market-movers] tbody tr')).toHaveCount(1);
    // 여러 상품 한꺼번에
    await app(page).locator('[data-k="scan"]').click();
    await expect(app(page)).toContainText('전체 시장이 아닙니다');
    expect(await tracker.collect()).toEqual([]);
});

for (const width of [375, 1440]) {
    test(`내 돈에 맞는 화물선과 화물칸 보기 (${width}px)`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const tracker = await prepare(page);
        await gotoSection(page, '?lang=ko#market?tab=ships');
        const budget = app(page).locator('[data-market-budget]');
        await expect(budget).toContainText('가진 돈을 적으면');

        await app(page).locator('[data-k="budget-money"]').fill('2,000,000');
        await app(page).locator('[data-k="budget-money"]').press('Tab');
        const rows = budget.locator('.market-table tbody tr');
        await expect(rows).toHaveCount(2);
        const buy = rows.filter({ hasText: '구매' });
        await expect(buy).toContainText('MISC 헐 A');
        await expect(buy).toContainText('1,615,950 aUEC');
        await expect(buy).toContainText('5일 전');
        await expect(buy).toContainText('New Deal');
        await expect(buy).toContainText('64 SCU');
        await expect(buy).toContainText('384,050 aUEC');   // 남는 돈
        // 실제로 싣는 양: 화물칸은 64 SCU 지만 상점 재고가 50 SCU 뿐이다. "가득 싣는 돈"이라고 하지 않는다.
        await expect(buy).toContainText('50 SCU / 화물칸 64 SCU');
        await expect(buy).toContainText('드는 돈 105,000 aUEC');   // 50 SCU × 2,100
        await expect(buy).toContainText('상점 재고가 여기까지');
        await expect(buy).not.toContainText('가득');
        await expect(buy).toContainText('25,000 aUEC');    // 한 번 이익: 50 SCU × (2,600 − 2,100)
        await expect(buy).toContainText('같은 경로 65번');  // ceil(1,615,950 ÷ 25,000)
        // 대여 32,319 ÷ 25,000 → 2번. 걸리는 시간은 2번을 다 다녀오는 시간이다 (한 번보다 짧게 나오지 않는다).
        const rent = rows.filter({ hasText: '대여' });
        await expect(rent).toContainText('같은 경로 2번');
        await expect(rent).toContainText('돌아오는 시간 제외');
        await expect(rows.filter({ hasText: '대여' })).toContainText('대여 기간: 자료에 없음');
        await expect(budget.locator('.market-assume')).toHaveCount(1);
        await budget.locator('.market-assume summary').click();
        await expect(budget.locator('.market-assume')).toContainText('같은');
        expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).budget, STATE_KEY)).toBe(2000000);
        await expectNoSidewaysScroll(page);

        // 돈이 모자라면 대여만 남는다.
        await app(page).locator('[data-k="budget-money"]').fill('100000');
        await app(page).locator('[data-k="budget-money"]').press('Tab');
        await expect(rows).toHaveCount(1);
        await expect(rows).toContainText('대여');

        // 화물칸 보기: 표의 함선 이름 → 구역, 가장 큰 상자, 상자 크기별 개수
        await rows.getByRole('link', { name: 'MISC 헐 A' }).click();
        await expect(page).toHaveURL(/#market\?ship=hull-a&tab=ships$/);
        const hold = app(page).locator('[data-market-hold="hull-a"]');
        // 화물칸 보기는 표 아래에 있다: 누르면 그곳으로 화면과 초점이 간다.
        await expect(hold.locator('[data-k="hold-title"]')).toBeFocused();
        await expect.poll(() => top(hold)).toBeLessThan(200);
        expect(await top(hold)).toBeGreaterThanOrEqual(50);
        await expect(hold.locator('.market-traits')).toContainText('64 SCU');
        await expect(hold.locator('.market-traits')).toContainText('16 SCU');
        await expect(hold.locator('tr', { hasText: '2 × 4 × 2' })).toContainText('4');
        await expect(hold.locator('tbody tr', { hasText: /^\s*16 SCU/ })).toContainText('4개 (64 SCU)');
        await expect(hold.locator('tbody tr', { hasText: /^\s*32 SCU/ })).toContainText('안 들어감');
        await expect(hold.locator('tbody tr', { hasText: /^\s*1 SCU/ })).toContainText('64개 (64 SCU)');
        await expectNoSidewaysScroll(page);

        // 화물칸 크기가 게임 자료에 없는 함선은 0 이 아니라 "없음"으로.
        await app(page).locator('[data-k="hold-ship"]').selectOption('ursa');
        await expect(app(page).locator('[data-market-hold="ursa"]')).toContainText('게임 자료에 없습니다');
        expect(await tracker.collect()).toEqual([]);
    });
}

test('가격을 못 받아도 화면은 남는다: 안내와 다시 시도, 화물칸 보기는 그대로', async ({ page }) => {
    await prepare(page, { marketStatus: 401 });
    await gotoSection(page, '?lang=ko#market');
    await expect(app(page).locator('.market-error')).toContainText('가격을 보려면 로그인이 필요합니다.');
    await expect(app(page).locator('[data-k="retry-prices"]')).toBeVisible();
    await expect(app(page).locator('[data-market-source]')).not.toContainText('게임 버전 4.');
    await app(page).locator('[data-k="tab-ships"]').click();
    await expect(app(page).locator('[data-market-budget] .market-error')).toBeVisible();
    await app(page).locator('[data-k="hold-ship"]').selectOption('hull-a');
    await expect(app(page).locator('[data-market-hold="hull-a"] .market-traits')).toContainText('64 SCU');

    // 다시 시도하면 가격이 들어온다.
    await page.unroute('**/api/uex/market**');
    const data = fixtures();
    await page.route('**/api/uex/market**', (route) => route.fulfill(ok(data.market)));
    await app(page).locator('[data-k="tab-prices"]').click();
    await app(page).locator('[data-k="retry-prices"]').click();
    await expect(row(page, '알루미늄')).toContainText('300 aUEC');
    // 다시 시도 단추가 사라져도 초점은 본문에 남는다.
    await expect(app(page).locator('.market-body')).toBeFocused();
});

test('경로 표: 불법 상품과 가득 찬 도착지 상점을 줄마다 표시한다', async ({ page }) => {
    const tracker = await prepare(page, { state: { v: 1, ship: 'hull-a', budget: null, system: null, maxAgeDays: 3, time: {} } });
    await gotoSection(page, '?lang=ko#market?c=53');
    const routes = app(page).locator('[data-market-commodity="53"] [data-market-routes]');
    const line = routes.locator('tbody tr').first();
    await expect(line).toContainText('루인 스테이션');
    await expect(line).toContainText('불법: 도착지에서 금지 품목');
    await expect(line).toContainText('도착지 상점이 가득 찬 것으로 보고됨');
    await expect(routes.locator('[data-market-illegal]')).toContainText('벌금·압수 위험을 넣지 않았습니다');

    // 거래소 정보의 "여기서 출발하는 좋은 경로"도 같은 표시를 한다.
    await page.evaluate(() => { window.location.hash = '#market?t=466'; });
    const fromHere = app(page).locator('[data-market-station="466"] [data-market-routes]');
    await expect(fromHere.locator('tbody tr', { hasText: '불법: 도착지에서 금지 품목' })).toHaveCount(1);
    await expect(fromHere.locator('tbody tr', { hasText: '도착지 상점이 가득 찬 것으로 보고됨' })).toHaveCount(1);
    // 합법 상품에는 표시가 없다.
    await page.evaluate(() => { window.location.hash = '#market?c=5'; });
    await expect(app(page).locator('[data-market-commodity="5"] [data-market-routes] tbody tr').first()).not.toContainText('불법');
    expect(await tracker.collect()).toEqual([]);
});

test('가격 기록: 아래쪽 줄에서 열어도 화면이 위로 튀지 않고, 닫으면 그 자리에 남는다 (375px)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 600 });
    const tracker = await prepare(page);
    await gotoSection(page, '?lang=ko#market?c=5');
    const opener = app(page).locator('[data-k="h-466-5"]');
    await opener.scrollIntoViewIfNeeded();
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(400);
    await opener.click();
    const close = app(page).locator('[data-k="history-close"]');
    await expect(close).toBeFocused();
    await expect(app(page).locator('[data-market-history] .market-chart-dot')).toHaveCount(3);
    // 화면은 위로 올라가지 않는다. 닫기 단추는 고정 머리글 아래, 화면 안에 있다.
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThanOrEqual(before);
    expect(await top(close)).toBeGreaterThanOrEqual(57);
    expect(await top(close)).toBeLessThan(600);
    await page.keyboard.press('Enter');
    await expect(opener).toBeFocused();
    const openerTop = await top(opener);
    expect(openerTop).toBeGreaterThanOrEqual(57);
    expect(openerTop).toBeLessThan(600);
    expect(await tracker.collect()).toEqual([]);
});

test('거래소: 이름이 같은 두 곳을 구별하고, 게임 자료에만 있는 시설을 "보고됨"으로 쓰지 않는다', async ({ page }) => {
    const now = Math.floor(Date.now() / 1000);
    const tracker = await prepare(page, {
        extra: {
            terminals: [
                { id: 49, type: 'commodity', name: 'IO North Tower - Area 18', nick: 'Area 18 IO Tower', code: 'IONOR', live: true, system: 'Stanton', planet: 'ArcCorp', city: 'Area 18', flags: ['autoLoad', 'freightElevator'], maxBox: 32 },
                { id: 1, type: 'commodity', name: 'Admin - ARC-L1', nick: 'ARC-L1', code: 'ARCL1', live: true, system: 'Stanton', planet: 'ArcCorp', stationId: 1, station: 'ARC-L1 Wide Forest Station', flags: ['autoLoad', 'freightElevator'], maxBox: 32 },
            ],
            market: [
                { t: 49, c: 5, buy: 310, stock: 20, sb: 2, box: [1, 2, 4, 8], at: now - 3600 },
                { t: 1, c: 5, sell: 350, box: [1, 2, 4, 8], at: now - 3600 },
            ],
        },
    });
    await gotoSection(page, `?lang=ko#market?tab=stations&q=${encodeURIComponent('에어리어')}`);
    const rows = app(page).locator('.market-table tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: 'TDD Area 18' })).toHaveCount(1);
    await expect(rows.filter({ hasText: 'Area 18 IO Tower' })).toHaveCount(1);
    // 이름이 하나뿐인 곳에는 UEX 이름을 덧붙이지 않는다.
    await page.evaluate(() => { window.location.hash = '#market?tab=stations&q=Everus'; });
    await expect(rows).toHaveCount(1);
    await expect(rows.locator('small').first()).toHaveText('Stanton · Everus Harbor');

    // ARC-L1: UEX 보고에는 정제소가 없고 게임 자료에는 있다.
    await page.evaluate(() => { window.location.hash = '#market?t=1'; });
    const refinery = app(page).locator('[data-market-station="1"] .market-flags li', { hasText: '정제소' });
    await expect(refinery).toContainText('보고 없음 · 게임 자료에는 있음');
    await expect(refinery).not.toHaveClass(/is-yes/);
    await expect(app(page).locator('[data-market-station="1"] .market-flags li', { hasText: '화물 엘리베이터' })).toHaveClass(/is-yes/);
    expect(await tracker.collect()).toEqual([]);
});

test('시세 변동: 여러 상품 살펴보기 결과는 주소에 남아 새로 고쳐도 보인다', async ({ page }) => {
    await prepare(page);
    await gotoSection(page, '?lang=ko#market?tab=movers');
    await expect(app(page)).toContainText('상품이나 거래소를 고르거나');
    await app(page).locator('[data-k="scan"]').click();
    await expect(page).toHaveURL(/#market\?scan=1&tab=movers$/);
    await expect(app(page)).toContainText('전체 시장이 아닙니다');
    await page.reload();
    await expect(app(page)).toContainText('전체 시장이 아닙니다');
    await expect(app(page).locator('[data-market-movers] tbody tr').first()).toBeVisible();
    // 상품을 고르면 살펴보기 표시는 주소에서 빠진다.
    await app(page).locator('[data-k="movers-c"]').selectOption('5');
    await expect(page).toHaveURL(/#market\?c=5&tab=movers$/);
});

test('돈 입력: 잘못 적으면 알리고 값을 바꾸지 않는다. 쉼표와 aUEC 는 받아 주고 쉼표를 넣어 보여 준다', async ({ page }) => {
    await prepare(page);
    await gotoSection(page, '?lang=ko#market');
    await openSettings(page);
    const money = app(page).locator('[data-k="my-money"]');
    await money.fill('1,500,000 aUEC');
    await money.press('Tab');
    await expect(money).toHaveValue('1,500,000');
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).budget, STATE_KEY)).toBe(1500000);
    await money.fill('-5');
    await money.press('Tab');
    await expect(app(page).locator('.market-fieldnote')).toHaveText('0 이상의 숫자만 적을 수 있습니다. 값을 바꾸지 않았습니다.');
    await expect(money).toHaveValue('1,500,000');
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).budget, STATE_KEY)).toBe(1500000);
    await money.fill('');
    await money.press('Tab');
    await expect(app(page).locator('.market-fieldnote')).toHaveCount(0);
    expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).budget, STATE_KEY)).toBe(null);
});

test('상품 이름을 못 받으면 번호로 보인다는 안내와 다시 시도가 나온다', async ({ page }) => {
    await prepare(page, { namesStatus: 500 });
    await gotoSection(page, '?lang=ko#market');
    await expect(app(page).locator('[data-market-names]')).toContainText('상품 이름을 받아 오지 못해 번호로 보여 줍니다');
    await expect(app(page).locator('.market-table tbody tr').first()).toContainText('상품 #');
    await page.unroute('**/api/uex/commodities');
    await page.route('**/api/uex/commodities', (route) => route.fulfill(ok(fixtures().commodities)));
    await app(page).locator('[data-market-names] [data-k="retry-prices"]').click();
    await expect(row(page, '알루미늄')).toHaveCount(1);
    await expect(app(page).locator('[data-market-names]')).toHaveCount(0);
});

test('다른 화면을 보는 동안에는 다시 그리지 않고, 돌아오면 바뀐 값으로 그린다', async ({ page }) => {
    await prepare(page);
    await gotoSection(page, '?lang=ko#market');
    await expect(row(page, '알루미늄')).toHaveCount(1);
    await page.evaluate(() => { window.location.hash = '#routes'; });
    await expect(page.locator('#routes')).toHaveClass(/active/);
    await page.evaluate(() => {
        document.querySelector('#market-app .market-tabs').setAttribute('data-test-mark', '1');
        window.VOLT_TRADE_ENGINE.state.set({ maxAgeDays: 7 });
    });
    await page.waitForTimeout(300);
    await expect(app(page).locator('.market-tabs[data-test-mark]')).toHaveCount(1);
    await page.evaluate(() => { window.location.hash = '#market'; });
    await expect(page.locator('#market')).toHaveClass(/active/);
    await expect(app(page).locator('.market-tabs[data-test-mark]')).toHaveCount(0);
    await expect(row(page, '알루미늄')).toContainText('420 aUEC');
});

test('영어 화면과 언어 전환, 모르는 주소 값은 조용히 기본 화면', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const tracker = await prepare(page);
    await gotoSection(page, '?lang=en#market?tab=nope&c=abc&t=-3&zzz=1');
    await expect(app(page).locator('[data-k="tab-prices"]')).toHaveAttribute('aria-current', 'page');
    await expect(app(page).locator('[data-k="tab-prices"]')).toHaveText('Commodity prices');
    const aluminum = row(page, 'Aluminum');
    await expect(aluminum).toContainText('Everus Harbor');
    await expect(aluminum).toContainText('2 h ago');
    await expect(app(page).locator('[data-market-source]')).toContainText('UEX player reports');
    await expectNoSidewaysScroll(page);

    // 없는 상품·거래소 id: 오류 없이 안내만.
    await page.evaluate(() => { window.location.hash = '#market?c=4242'; });
    await expect(app(page)).toContainText('This commodity is not in the price data we received.');
    await page.evaluate(() => { window.location.hash = '#market?t=4242'; });
    await expect(app(page)).toContainText('This station is not in the data we received.');

    await page.evaluate(() => { window.location.hash = '#market?t=25'; });
    await expect(app(page).locator('[data-market-station="25"] h3')).toHaveText('Everus Harbor');
    await page.evaluate(() => window.VOLT_I18N.setLang('ko'));
    await expect(app(page).locator('[data-market-station="25"] h3')).toContainText('에버러스 하버');
    await expect(app(page).locator('[data-k="tab-stations"]')).toHaveText('거래 장소');
    expect(await tracker.collect()).toEqual([]);
});
