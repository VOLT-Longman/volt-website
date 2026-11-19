const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

// 순회 무역(#tours): 순회 경로 찾기와 섞어 싣기. 계약: docs/helper-tools.md, 계산: docs/trade-engine.md
// 개발 서버에는 Functions 가 없으므로 /api/uex/* 는 아래 작은 자료로 대신한다.
// 터미널 id 는 data/trade/world.json 이 게임 위치와 이어 주는 실제 id (모두 스탠튼의 정거장).

const HOUR = 3600;
const now = () => Math.floor(Date.now() / 1000);
const TERMINALS = [
    { id: 1, type: 'commodity', name: 'Admin - ARC-L1', nick: 'ARC-L1', code: 'ARCL1', live: true, system: 'Stanton', station: 'ARC-L1 Wide Forest Station', flags: ['autoLoad', 'freightElevator'], maxBox: 32 },
    { id: 2, type: 'commodity', name: 'Admin - ARC-L2', nick: 'ARC-L2', code: 'ARCL2', live: true, system: 'Stanton', station: 'ARC-L2 Lively Pathway Station', flags: ['autoLoad', 'freightElevator'], maxBox: 32 },
    { id: 13, type: 'commodity', name: 'Admin - Baijini Point', nick: 'Baijini Point', code: 'BAIJI', live: true, system: 'Stanton', station: 'Baijini Point', flags: ['autoLoad', 'freightElevator'], maxBox: 32 },
    { id: 66, type: 'commodity', name: 'Admin - Port Tressler', nick: 'Port Tressler', code: 'TRESS', live: true, system: 'Stanton', station: 'Port Tressler', flags: ['freightElevator'], maxBox: 32 },
    // 에어리어 18 에는 터미널이 둘 있다 (같은 게임 위치): 고르는 목록에서 서로 구별되어야 한다.
    { id: 12, type: 'commodity', name: 'TDD - Trade and Development Division - Area 18', nick: 'TDD Area 18', code: 'TDA18', live: true, system: 'Stanton', planet: 'ArcCorp', city: 'Area 18', flags: ['autoLoad', 'freightElevator'], maxBox: 32 },
    { id: 49, type: 'commodity', name: 'IO North Tower - Area 18', nick: 'Area 18 IO Tower', code: 'IONOR', live: true, system: 'Stanton', planet: 'ArcCorp', city: 'Area 18', flags: ['autoLoad', 'freightElevator'], maxBox: 32 },
];
const COMMODITIES = [
    { id: 5, name: 'Aluminum', code: 'ALUM', kind: 'Metal', is_illegal: 0 },
    { id: 20, name: 'Copper', code: 'COPP', kind: 'Metal', is_illegal: 0 },
    { id: 109, name: 'Steel', code: 'STEE', kind: 'Alloy', is_illegal: 0 },
    { id: 75, name: 'Titanium', code: 'TITA', kind: 'Metal', is_illegal: 0 },
    { id: 32, name: 'Gasping Weevil Eggs', code: 'GAWE', kind: 'Natural', is_illegal: 1 }, // 게임 자료에서 모든 관할 금지 품목
];
const BOX = [1, 2, 4, 8, 16, 24, 32];
function market() {
    const fresh = now() - 2 * HOUR;
    return [
        { t: 1, c: 5, buy: 100, stock: 500, sb: 5, box: BOX, at: fresh },          // ARC-L1 에서 알루미늄을 산다
        { t: 13, c: 5, sell: 150, box: BOX, at: fresh },                            // 바이지니에서 판다 (재고 수준 보고 없음)
        { t: 66, c: 5, sell: 140, inv: 900, ss: 7, box: BOX, at: fresh },           // 트레슬러는 가득 찼다고 보고됨
        { t: 13, c: 20, buy: 200, box: BOX, at: fresh },                            // 바이지니의 구리: 재고 보고 없음
        { t: 66, c: 20, sell: 280, box: BOX, at: fresh },
        { t: 66, c: 109, buy: 50, stock: 1000, sb: 6, box: BOX, at: fresh },
        { t: 1, c: 109, sell: 90, box: BOX, at: fresh },
        { t: 2, c: 5, buy: 10, stock: 9999, box: BOX, at: now() - 10 * 24 * HOUR }, // 열흘 전 보고: 기본 3일 기준에서는 쓰지 않는다
        // 티타늄은 SCU당 차익(200)이 알루미늄(50)보다 크지만 재고가 10 SCU뿐이다: 하나만 실을 때는 알루미늄(25,000)이 낫다.
        { t: 1, c: 75, buy: 1000, stock: 10, sb: 1, box: BOX, at: fresh },
        { t: 13, c: 75, sell: 1200, box: BOX, at: fresh },
        // ARC-L2 의 불법 화물: 기본(합법 화물만)에서는 쓰지 않는다.
        { t: 2, c: 32, buy: 1000, stock: 4, box: BOX, at: fresh },
        { t: 13, c: 32, sell: 50000, box: BOX, at: fresh },
        // 에어리어 18 의 두 터미널에서 강철을 산다.
        { t: 12, c: 109, buy: 60, stock: 100, box: BOX, at: fresh },
        { t: 49, c: 109, buy: 61, stock: 100, box: BOX, at: fresh },
    ];
}
const SHIP_STATE = { v: 1, ship: 'c2-hercules', budget: null, system: null, maxAgeDays: 3, time: {}, boxes: null };

async function open(page, { hash = '#tours', state = SHIP_STATE, lang = 'ko', uex = 'ok', names = uex } = {}) {
    const errors = trackConsoleErrors(page);
    await mockApi(page, { fleet: true });
    const meta = { source: 'uex', cached: true, ttlSeconds: 1800, fetchedAt: new Date(Date.now() - 5 * 60000).toISOString() };
    const answer = (data) => (route) => (uex === 'ok' ? route.fulfill({ json: { status: 'ok', data, meta } }) : route.fulfill({ status: 503, json: { error: 'down' } }));
    await page.route('**/api/uex/market**', answer(market()));
    await page.route('**/api/uex/terminals**', answer(TERMINALS));
    await page.route('**/api/uex/commodities**', (route) => (names === 'ok' ? route.fulfill({ json: { status: 'ok', data: COMMODITIES, meta } }) : route.fulfill({ status: 503, json: { error: 'down' } })));
    await page.addInitScript(([language, saved]) => {
        localStorage.setItem('volt-lang', language);
        if (saved) localStorage.setItem('volt-helper-state-v1', JSON.stringify(saved));
    }, [lang, state]);
    await gotoSection(page, hash);
    await expect(page.locator('#tours-app .tours-tabs')).toBeVisible();
    return errors;
}

async function expectNoSidewaysScroll(page) {
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, '가로 스크롤이 없어야 함').toBeLessThanOrEqual(1);
}

test('순회 무역: 함선을 고르지 않으면 안내하고, 고르면 공용 저장소에 적는다', async ({ page }) => {
    const errors = await open(page, { state: null });
    const app = page.locator('#tours-app');
    await app.locator('[data-act="run-tour"]').click();
    await expect(app.locator('.tours-main')).toContainText('함선을 고르세요');
    if (!(await app.locator('[data-conditions]').evaluate((node) => node.open))) await app.locator('[data-conditions] > summary').click();
    await app.locator('[data-k="ship"]').selectOption('c2-hercules');
    await expect(app.locator('.tours-cards')).toBeVisible();
    await expect(app.locator('.tours-mine')).toContainText('화물칸 696 SCU');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('volt-helper-state-v1')));
    expect(saved.ship).toBe('c2-hercules');
    expect(saved.maxAgeDays).toBe(3);
    await expect(app.locator('.tours-source')).toContainText('자료: 게임 파일');
    await expect(app.locator('.tours-source')).toContainText('UEX 이용자 보고');
    expect(errors).toEqual([]);
});

test('순회 무역: 세 곳을 도는 순회를 찾고 구간별 살 것·팔 것을 보여 준다', async ({ page }) => {
    const errors = await open(page);
    const app = page.locator('#tours-app');
    await app.locator('[data-k="tour.start"]').selectOption('1');
    await app.locator('[data-act="run-tour"]').click();
    const first = app.locator('.tours-card').first();
    // ARC-L1 → 바이지니(알루미늄) → 트레슬러(구리)
    await expect(first.locator('.tours-stop')).toHaveCount(3);
    await expect(first).toContainText('추정');
    await expect(first).toContainText('시간당 이익');
    await expect(first.locator('.tours-flag')).toHaveCount(0); // 합법 화물뿐이면 경고 표시가 없다
    await expect(page).toHaveURL(/#routes\?.*n=3/);            // 찾기를 돌리면 주소에 남는다
    // 알루미늄 500 SCU × (150 − 100) + 구리 696 SCU × (280 − 200) = 25,000 + 55,680
    await expect(first).toContainText('+80,680 aUEC');
    await first.locator('[data-act="open"]').click();
    await expect(page).toHaveURL(/#routes\?.*stops=1%2C13%2C66/);
    const legs = app.locator('.tours-leg');
    await expect(legs).toHaveCount(2);
    await expect(legs.nth(0)).toContainText('500 SCU');
    // 차익이 더 큰 티타늄(재고 10 SCU, 이익 2,000)이 아니라 이익이 큰 알루미늄을 싣는다.
    await expect(legs.nth(0)).toContainText('알루미늄');
    await expect(legs.nth(0)).not.toContainText('티타늄');
    await expect(legs.nth(0)).toContainText('보고된 재고만큼');
    await expect(legs.nth(0)).toContainText('SCU당 100 aUEC');
    await expect(legs.nth(0)).toContainText('가격 보고 2시간 전');
    await expect(legs.nth(0)).toContainText('받아 주는 양: 자료에 없음');
    await expect(legs.nth(1)).toContainText('696 SCU');
    await expect(legs.nth(1)).toContainText('재고 보고 없음');
    await expect(legs.nth(0).locator('a[href^="#routes?"]')).toHaveAttribute('href', '#routes?c=5&from=1&to=13');
    await expect(app.locator('.tours-assume')).toContainText('우리가 정한 기본값');
    await expect(app.locator('.tours-assume')).toContainText('도착지가 몇 SCU까지 받아 주는지는 자료에 없습니다');
    await app.locator('[data-act="back"]').click();
    await expect(app.locator('.tours-cards')).toBeVisible();
    await expect(page).not.toHaveURL(/stops=/);
    expect(errors).toEqual([]);
});

test('순회 무역: 돌아오기·도착지·오래된 보고 제외', async ({ page }) => {
    const errors = await open(page);
    const app = page.locator('#tours-app');
    // 돌아오기: 1 → 13 → 66 → 1, 마지막 구간에 강철을 싣는다.
    await app.locator('[data-k="tour.start"]').selectOption('1');
    await app.locator('[data-k="tour.rt"]').selectOption('1');
    await expect(app.locator('[data-k="tour.end"]')).toBeDisabled();
    await app.locator('[data-act="run-tour"]').click();
    const first = app.locator('.tours-card').first();
    await expect(first.locator('.tours-stop')).toHaveCount(4);
    await first.locator('[data-act="open"]').click();
    await expect(app.locator('.tours-leg')).toHaveCount(3);
    await expect(app.locator('.tours-leg').nth(2)).toContainText('돌아오는 길');
    await expect(app.locator('.tours-leg').nth(2)).toContainText('강철');
    // 도착지를 정하면 그곳에서 끝나는 순회만.
    await app.locator('[data-act="back"]').click();
    await app.locator('[data-k="tour.rt"]').selectOption('');
    await app.locator('[data-k="tour.n"]').selectOption('2');
    await app.locator('[data-k="tour.end"]').selectOption('13');
    await expect(app.locator('.tours-card')).toHaveCount(1);
    await expect(app.locator('.tours-card .tours-stop').last()).toContainText(/Baijini|바이지니/);
    // 열흘 전 보고만 있는 ARC-L2 에서는 출발할 수 없다 (기본 3일). 기준을 늘리면 쓴다.
    await app.locator('[data-k="tour.end"]').selectOption('');
    await app.locator('[data-k="tour.start"]').selectOption('2');
    await expect(app.locator('.tours-main .tours-empty')).toContainText('찾지 못했습니다');
    if (!(await app.locator('[data-conditions]').evaluate((node) => node.open))) await app.locator('[data-conditions] > summary').click();
    await app.locator('[data-k="age"]').fill('30');
    await app.locator('[data-k="age"]').blur();
    await expect(app.locator('.tours-card').first()).toContainText('10일 전');
    expect(errors).toEqual([]);
});

test('순회 무역: 주소의 stops 로 계획을 바로 열고, 모르는 값은 조용히 넘긴다', async ({ page }) => {
    const errors = await open(page, { hash: '#tours?stops=66,1&zzz=1' });
    const app = page.locator('#tours-app');
    await expect(app.locator('.tours-leg')).toHaveCount(1);
    await expect(app.locator('.tours-leg')).toContainText('강철');
    await expect(app.locator('.tours-leg')).toContainText('696 SCU');
    await page.evaluate(() => { window.location.hash = '#tours?stops=999999,1'; });
    await expect(app.locator('.tours-main [role="alert"]')).toContainText('찾을 수 없습니다');
    await page.evaluate(() => { window.location.hash = '#tours?stops=abc&n=99&goal=nope'; });
    await expect(app.locator('[data-k="tour.n"]')).toHaveValue('8');
    await expect(app.locator('[data-k="tour.goal"]')).toHaveValue('perHour');
    expect(errors).toEqual([]);
});

test('섞어 싣기: 꼭 실을 상품과 남는 칸 채우기, 한 곳·상품마다 다른 곳', async ({ page }) => {
    const errors = await open(page);
    const app = page.locator('#tours-app');
    await app.locator('[data-tab="mix"]').click();
    await app.locator('[data-k="mix.at"]').selectOption('13');
    await app.locator('[data-act="fx-add"]').click();
    await app.locator('[data-k="fx.0.c"]').selectOption('20');
    await app.locator('[data-k="fx.0.scu"]').fill('40');
    await app.locator('[data-act="run-mix"]').click();
    const card = app.locator('.tours-card').first();
    await expect(card).toContainText('40 SCU');
    await expect(card).toContainText('꼭 실을 상품');
    await expect(card).toContainText('정해 둔 양');
    await expect(card).toContainText('+3,200 aUEC');
    await expect(page).toHaveURL(/tab=mix/);
    await expect(page).toHaveURL(/fx=20%3A40/);
    // 상품마다 가장 비싼 곳: 판매처 칸은 쓰지 않고, 가정이 화면에 적힌다.
    await app.locator('[data-k="mix.dest"]').selectOption('each');
    await expect(app.locator('[data-k="mix.to"]')).toBeDisabled();
    await expect(app.locator('.tours-assume')).toContainText('남은 SCU만으로');
    await expect(app.locator('.tours-card')).toHaveCount(1);
    // 두 곳: 이 자료에서는 구리를 사 주는 곳이 한 곳뿐이라 계획이 없다.
    await app.locator('[data-k="mix.dest"]').selectOption('two');
    await expect(app.locator('.tours-main .tours-empty')).toContainText('찾지 못했습니다');
    expect(errors).toEqual([]);
});

test('섞어 싣기: 이미 실은 화물을 어디에 팔지와 가는 김에 실을 것', async ({ page }) => {
    const errors = await open(page, { hash: '#tours?tab=mix&mix=board&at=1&cg=5:100,109:50:60' });
    const app = page.locator('#tours-app');
    // 주소에 화물이 있으면 바로 계산한다. 알루미늄과 강철을 함께 사 주는 곳은 없다.
    const cards = app.locator('.tours-card');
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toContainText('100 SCU');
    await expect(cards.first()).toContainText('15,000 aUEC');
    await expect(cards.first()).toContainText('여기서는 못 파는 상품');
    await expect(cards.first()).toContainText('산 값을 적으면 계산');
    await expect(cards.first()).toContainText('가는 김에');
    await expect(cards.nth(1)).toContainText('가득 찼다고 보고됨');
    await expect(app.locator('.tours-pergood')).toContainText('SCU당 150 aUEC');
    await expect(app.locator('.tours-pergood')).toContainText('가격 보고 2시간 전');
    // 강철은 ARC-L1(지금 있는 곳)에서만 사 주므로 다른 판매처가 없다.
    await expect(app.locator('.tours-pergood')).toContainText('사 주는 곳이 없습니다');
    expect(errors).toEqual([]);
});

test('순회 무역: 가격을 못 받아 와도 내 조건은 보이고 다시 시도할 수 있다', async ({ page }) => {
    await open(page, { uex: 'down' });
    const app = page.locator('#tours-app');
    await expect(app.locator('.tours-main [role="alert"]')).toContainText('UEX 가격을 받아 올 수 없습니다');
    await expect(app.locator('[data-k="ship"]')).toHaveValue('c2-hercules');
    await expect(app.locator('.tours-mine')).toContainText('화물칸 696 SCU');
    await expect(app.locator('.tours-source')).toContainText('게임 버전');
    await expect(app.locator('[data-act="run-tour"]')).toHaveCount(0);
    await page.unroute('**/api/uex/market**');
    await page.unroute('**/api/uex/terminals**');
    await page.unroute('**/api/uex/commodities**');
    const meta = { fetchedAt: new Date().toISOString() };
    await page.route('**/api/uex/market**', (route) => route.fulfill({ json: { status: 'ok', data: market(), meta } }));
    await page.route('**/api/uex/terminals**', (route) => route.fulfill({ json: { status: 'ok', data: TERMINALS, meta } }));
    await page.route('**/api/uex/commodities**', (route) => route.fulfill({ json: { status: 'ok', data: COMMODITIES, meta } }));
    await app.locator('[data-act="retry"]').click();
    await expect(app.locator('[data-act="run-tour"]')).toBeVisible();
    await expect(app.locator('[data-k="tab-tour"]')).toBeFocused(); // 다시 시도 단추가 사라져도 초점이 화면 안에 남는다
});

test('순회 무역: 한 곳에서 여러 가지를 실으면 재고가 적은 상품도 함께 싣는다', async ({ page }) => {
    // 목표가 이익일 때: 티타늄 10 SCU 를 더 실으면 이익이 는다 (시간당 이익이 목표면 싣는 시간 때문에 알루미늄만 싣는다).
    const errors = await open(page, { hash: '#tours?stops=1,13&g=2&goal=profit' });
    const leg = page.locator('#tours-app .tours-leg');
    await expect(leg).toHaveCount(1);
    await expect(leg).toContainText('티타늄');
    await expect(leg).toContainText('10 SCU');
    await expect(leg).toContainText('알루미늄');
    await expect(leg).toContainText('500 SCU');
    await expect(leg).toContainText('+27,000 aUEC'); // 10 × 200 + 500 × 50
    expect(errors).toEqual([]);
});

test('순회 무역: 기본은 합법 화물만, 끄면 불법 화물이 든 순회에 표시가 붙는다', async ({ page }) => {
    const errors = await open(page, { hash: '#tours?start=2&n=2' });
    const app = page.locator('#tours-app');
    await expect(app.locator('[data-k="tour.legal"]')).toBeChecked();
    await expect(app.locator('.tours-main .tours-empty')).toContainText('찾지 못했습니다');
    if (!(await app.locator('[data-tour-advanced]').evaluate((node) => node.open))) await app.locator('[data-tour-advanced] > summary').click();
    await app.locator('[data-k="tour.legal"]').uncheck();
    const card = app.locator('.tours-card').first();
    await expect(card).toContainText('불법 화물 포함');
    await expect(card).toContainText('+196,000 aUEC'); // 4 SCU × (50,000 − 1,000)
    await expect(page).toHaveURL(/ill=1/);
    await card.locator('[data-act="open"]').click();
    await expect(app.locator('.tours-main > .tours-flags')).toContainText('불법 화물 포함');
    await expect(app.locator('.tours-leg')).toContainText('가스핑 딱정벌레 알');
    await expect(app.locator('.tours-leg .tours-flag.is-warn')).toContainText('불법 화물');
    expect(errors).toEqual([]);
});

test('순회 무역: 새로 고쳐도 목록이 남고, 받은 계획 주소에서도 목록으로 돌아갈 수 있다', async ({ page }) => {
    const errors = await open(page);
    const app = page.locator('#tours-app');
    await app.locator('[data-act="run-tour"]').click();
    await expect(app.locator('.tours-card').first()).toBeVisible();
    await expect(page).toHaveURL(/#routes\?n=3&tab=tour$/);
    await page.reload();
    await expect(app.locator('.tours-card').first()).toBeVisible();
    // 계획을 연 채 새로 고치면 목록이 없는 상태다 (받은 주소로 들어온 것과 같다).
    await app.locator('[data-act="open"]').first().click();
    await expect(app.locator('.tours-leg').first()).toBeVisible();
    await page.reload();
    await expect(app.locator('.tours-leg').first()).toBeVisible();
    await app.locator('[data-act="back"]').click();
    await expect(app.locator('.tours-card').first()).toBeVisible();
    await expect(page).not.toHaveURL(/stops=/);
    // 계획을 보다가 "순회 경로 찾기" 탭을 눌러도 목록으로 간다.
    await app.locator('[data-act="open"]').first().click();
    await expect(app.locator('.tours-leg').first()).toBeVisible();
    await app.locator('[data-tab="tour"]').click();
    await expect(app.locator('.tours-leg')).toHaveCount(0);
    await expect(app.locator('.tours-card').first()).toBeVisible();
    expect(errors).toEqual([]);
});

test('순회 무역: 같은 곳의 두 터미널은 이름이 구별되고, 가격 기준일은 365일까지, 돈이 0이면 까닭을 말한다', async ({ page }) => {
    const errors = await open(page);
    const app = page.locator('#tours-app');
    const labels = await app.locator('[data-k="tour.start"] option').allTextContents();
    expect(new Set(labels).size, '출발지 목록에 같은 이름이 없어야 함').toBe(labels.length);
    expect(labels.filter((label) => label.includes('TDD Area 18'))).toHaveLength(1);
    expect(labels.filter((label) => label.includes('Area 18 IO Tower'))).toHaveLength(1);
    await page.evaluate(() => { window.location.hash = '#tours?stops=12,1'; });
    await expect(app.locator('.tours-leg .tours-path')).toContainText('(TDD Area 18)');
    if (!(await app.locator('[data-conditions]').evaluate((node) => node.open))) await app.locator('[data-conditions] > summary').click();
    await app.locator('[data-k="age"]').fill('1e9');
    await app.locator('[data-k="age"]').blur();
    await expect(app.locator('[data-k="age"]')).toHaveValue('365');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('volt-helper-state-v1')).maxAgeDays)).toBe(365);
    if (!(await app.locator('[data-conditions]').evaluate((node) => node.open))) await app.locator('[data-conditions] > summary').click();
    await app.locator('[data-k="budget"]').fill('0');
    await app.locator('[data-k="budget"]').blur();
    await expect(app.locator('.tours-leg')).toContainText('쓸 수 있는 돈이 0이라');
    await app.locator('[data-act="back"]').click();
    await expect(app.locator('.tours-main .tours-empty')).toContainText('쓸 수 있는 돈이 0이라');
    expect(errors).toEqual([]);
});

test('순회 무역: 상품 목록만 못 받아도 계산은 되고, 다시 시도한 뒤 초점이 화면에 남는다', async ({ page }) => {
    await open(page, { names: 'down' });
    const app = page.locator('#tours-app');
    await expect(app.locator('.tours-warn')).toContainText('상품 이름 자료를 받지 못했습니다');
    await expect(app.locator('[data-k="tour.legal"]')).toHaveCount(0); // 합법 여부를 가릴 수 없다고 적는다
    await expect(app.locator('.tours-panel').nth(1)).toContainText('합법 여부를 가릴 수 없습니다');
    await app.locator('[data-k="tour.start"]').selectOption('1');
    await app.locator('[data-act="run-tour"]').click();
    await expect(app.locator('.tours-card').first()).toContainText('합법 여부 모르는 화물 포함');
    await app.locator('.tours-warn [data-act="retry"]').focus();
    await page.keyboard.press('Enter');
    await expect(app.locator('.tours-warn [data-act="retry"]')).toBeFocused(); // 여전히 실패: 단추에 초점
    await page.unroute('**/api/uex/commodities**');
    await page.route('**/api/uex/commodities**', (route) => route.fulfill({ json: { status: 'ok', data: COMMODITIES, meta: { fetchedAt: new Date().toISOString() } } }));
    await page.keyboard.press('Enter');
    await expect(app.locator('.tours-warn')).toHaveCount(0);
    await expect(app.locator('[data-k="tab-tour"]')).toBeFocused();
    await expect(app.locator('[data-k="tour.legal"]')).toBeChecked();
});

test('섞어 싣기: 화물칸 크기를 모르는 함선이면 그렇게 말하고, 작은 글씨도 12px 이상이다', async ({ page }) => {
    const errors = await open(page, { hash: '#tours?tab=mix&mix=board&at=1&cg=5:100', state: { ...SHIP_STATE, ship: 'ursa' } });
    const app = page.locator('#tours-app');
    await expect(app.locator('.tours-card').first()).toBeVisible();
    await expect(app.locator('.tours-main')).toContainText('이 함선의 화물칸 크기는 게임 자료에 없어서');
    await expect(app.locator('.tours-main')).not.toContainText('함선을 고르면');
    if (!(await app.locator('[data-conditions]').evaluate((node) => node.open))) await app.locator('[data-conditions] > summary').click();
    await app.locator('[data-k="ship"]').selectOption('c2-hercules');
    const small = app.locator('.tours-box h5 small').first();
    await expect(small).toContainText('빈 칸 596 SCU');
    expect(parseFloat(await small.evaluate((node) => getComputedStyle(node).fontSize))).toBeGreaterThanOrEqual(12);
    expect(errors).toEqual([]);
});

for (const width of [375, 1440]) {
    test(`순회 무역: 영어 화면과 ${width}px 너비, 키보드로 찾기`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        const errors = await open(page, { lang: 'en' });
        const app = page.locator('#tours-app');
        await expect(app.locator('[data-tab="tour"]')).toHaveText('Visit multiple stops');
        await app.locator('[data-k="tour.start"]').selectOption('1');
        await app.locator('[data-act="run-tour"]').focus();
        await page.keyboard.press('Enter');
        await expect(app.locator('.tours-card').first()).toContainText('estimate');
        await expect(app.locator('[data-results]')).toBeFocused();
        await app.locator('[data-act="open"]').first().focus();
        await page.keyboard.press('Enter');
        await expect(app.locator('.tours-leg').first()).toContainText('price reported 2 h ago');
        await expect(app.locator('.tours-source')).toContainText('Data: game files');
        await expectNoSidewaysScroll(page);
        const small = await app.locator('button, select, input[type="number"], .tours-link').evaluateAll((nodes) => nodes
            .filter((node) => node.offsetParent !== null && node.getBoundingClientRect().height < 43.5).map((node) => node.outerHTML.slice(0, 80)));
        expect(small, '누르는 곳은 44px 이상').toEqual([]);
        await app.locator('[data-tab="mix"]').click();
        await expect(app.locator('[data-tab="mix"]')).toHaveText('Load several goods');
        await expect(app.locator('[data-act="run-mix"]')).toHaveText('Calculate');
        await expectNoSidewaysScroll(page);
        // 언어를 바꾸면 화면 글자가 바뀐다.
        await page.evaluate(() => window.VOLT_I18N.setLang('ko'));
        await expect(app.locator('[data-act="run-mix"]')).toHaveText('계산하기');
        expect(errors).toEqual([]);
    });
}
