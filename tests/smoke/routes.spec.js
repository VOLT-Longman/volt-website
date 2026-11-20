const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

// 무역 경로(#routes) 화면. 개발 서버에는 Functions가 없으므로 /api/uex/* 는 아래 고정 자료로 답한다.
// 터미널 번호는 data/trade/world.json 의 joins.terminals 에 있는 실제 번호라서 게임 위치·관할과 이어진다.
//   1 ARC-L1 (정거장, 자동 적재) · 4 ARC-L4 (정거장, 자동 적재) · 12 Area18 (도시, 자동 적재) · 85 Shubin SMCa-8 (전초기지)
const HOUR = 3600;
const ALL_BOXES = [1, 2, 4, 8, 16, 24, 32];

function fixtures() {
    const now = Math.floor(Date.now() / 1000);
    const ago = (hours) => now - Math.round(hours * HOUR);
    return {
        terminals: [
            { id: 1, type: 'commodity', name: 'Admin - ARC-L1', nick: 'ARC-L1', code: 'ARCL1', live: true, system: 'Stanton', planet: 'ArcCorp', stationId: 1, station: 'ARC-L1 Wide Forest Station', flags: ['autoLoad', 'freightElevator'], maxBox: 32 },
            { id: 4, type: 'commodity', name: 'Admin - ARC-L4', nick: 'ARC-L4', code: 'ARCL4', live: true, system: 'Stanton', planet: 'ArcCorp', stationId: 4, station: 'ARC-L4 Faint Glen Station', flags: ['autoLoad', 'freightElevator'], maxBox: 32 },
            { id: 12, type: 'commodity', name: 'TDD - Area 18', nick: 'TDD Area 18', code: 'TDA18', live: true, system: 'Stanton', planet: 'ArcCorp', cityId: 1, city: 'Area 18', flags: ['autoLoad', 'freightElevator'], maxBox: 32 },
            { id: 85, type: 'commodity', name: 'Shubin Mining Facility SMCa-8', nick: 'Shubin SMCa-8', code: 'SMCA8', live: true, system: 'Stanton', planet: 'MicroTech', moon: 'Calliope', outpostId: 54, outpost: 'Shubin Mining Facility SMCa-8', flags: ['freightElevator'], maxBox: 24 },
        ],
        market: [
            // 라라나이트: ARC-L1 → Area18, SCU당 1,500 이익, 재고 500
            { t: 1, c: 47, buy: 7000, stock: 500, sb: 5, box: ALL_BOXES, at: ago(2) },
            { t: 12, c: 47, sell: 8500, box: ALL_BOXES, at: ago(5) },
            // 알루미늄: ARC-L1 → ARC-L4 (정거장끼리). Area18 판매 보고는 5일 전이라 기본 기준(3일)에서는 안 쓴다.
            { t: 1, c: 5, buy: 300, stock: 900, sb: 6, box: ALL_BOXES, at: ago(2) },
            { t: 4, c: 5, sell: 420, box: ALL_BOXES, at: ago(1) },
            { t: 12, c: 5, sell: 1000, box: ALL_BOXES, at: ago(120) },
            // 아그리슘: Shubin → Area18, 재고 46, 판매처는 가득 찼다고 보고됨
            { t: 85, c: 1, buy: 8000, stock: 46, sb: 2, box: [1, 2, 4, 8, 16], at: ago(30) },
            { t: 12, c: 1, sell: 10000, inv: 100, ss: 7, box: ALL_BOXES, at: ago(5) },
            // 오소이안 가죽: 게임 자료에서 UEE 관할 금지 품목
            { t: 85, c: 53, buy: 1000, stock: 20, sb: 2, box: [1, 2, 4, 8], at: ago(3) },
            { t: 12, c: 53, sell: 9000, box: ALL_BOXES, at: ago(3) },
            // 돌아오는 길: Area18 → ARC-L1 스팀
            { t: 12, c: 70, buy: 4000, stock: 200, sb: 4, box: ALL_BOXES, at: ago(4) },
            { t: 1, c: 70, sell: 5300, box: ALL_BOXES, at: ago(6) },
        ],
        commodities: [
            { id: 47, name: 'Laranite', code: 'LARA', kind: 'Metal', is_illegal: 0 },
            { id: 5, name: 'Aluminum', code: 'ALUM', kind: 'Metal', is_illegal: 0 },
            { id: 1, name: 'Agricium', code: 'AGRI', kind: 'Metal', is_illegal: 0 },
            { id: 53, name: 'Osoian Hides', code: 'OSOH', kind: 'Vice', is_illegal: 1 },
            { id: 70, name: 'Stims', code: 'STIM', kind: 'Vice', is_illegal: 0 },
        ],
    };
}

async function expandControls(page, group) {
    const panel = page.locator(`.routes-${group}`);
    if (!(await panel.evaluate((node) => node.open))) await panel.locator(':scope > summary').click();
}

async function prepare(page, { lang = 'ko', state = null, market = null } = {}) {
    const data = fixtures();
    const meta = { source: 'uex', cached: true, ttlSeconds: 1800, fetchedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString() };
    await mockApi(page, { fleet: true });
    await page.route('**/api/uex/market**', (route) => (market ? market(route) : route.fulfill({ json: { status: 'ok', data: data.market, meta } })));
    await page.route('**/api/uex/terminals**', (route) => route.fulfill({ json: { status: 'ok', data: data.terminals, meta } }));
    await page.route('**/api/uex/commodities', (route) => route.fulfill({ json: { status: 'ok', data: data.commodities, meta } }));
    await page.addInitScript(([language, saved]) => {
        if (!window.localStorage.getItem('volt-lang')) window.localStorage.setItem('volt-lang', language);
        if (saved && !window.localStorage.getItem('volt-helper-state-v1')) window.localStorage.setItem('volt-helper-state-v1', JSON.stringify(saved));
    }, [lang, state]);
    return data;
}

const C2 = { v: 1, ship: 'c2-hercules', budget: null, system: null, maxAgeDays: 3, time: {}, boxes: null };
const app = (page) => page.locator('#routes-app');
const rows = (page) => page.locator('#routes-table tbody tr');
const sharedState = (page) => page.evaluate(() => JSON.parse(window.localStorage.getItem('volt-helper-state-v1') || 'null'));
const sideways = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

test('경로 표와 선택창이 같은 방향을 가리키고 휴대폰 카드도 순서를 바꾼다', async ({ page }) => {
    await prepare(page, { state: C2 });
    await gotoSection(page, '#routes');
    const table = page.locator('#routes-table');
    const route = table.locator('thead th').nth(1);
    await route.getByRole('button').click();
    await expect(route).toHaveAttribute('aria-sort', 'ascending');
    await expect(page.locator('#routes-sort')).toHaveValue('route');
    await page.setViewportSize({ width: 390, height: 844 });
    await app(page).locator('.volt-sort-mobile.for-routes select').first().selectOption('1/1');
    await expect(route).toHaveAttribute('aria-sort', 'descending');
    await expect(page.locator('#routes-sort')).toHaveValue('route-rev');
    await expect(rows(page).first().locator('[data-act="open"]')).toBeVisible();
});

test('무역 경로: 함선과 예산을 고르면 순위표가 나오고, 고른 값은 공용 저장소에 남는다', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page);
    await gotoSection(page, '#routes');
    await expect(app(page).locator('[data-routes-problem="no-ship"]')).toContainText('내 함선을 골라 주세요');
    await expect(page.locator('#routes-table')).toHaveCount(0);

    await expandControls(page, 'context');
    await page.locator('#routes-ship').selectOption('c2-hercules');
    await expect(rows(page).first()).toBeVisible();
    await expect(app(page).locator('.routes-hold')).toContainText('696 SCU');
    // 예산 없이: 재고 500 SCU × 1,500 = 750,000
    const laranite = page.locator('#routes-table tr[data-route="1-12"]');
    await expect(laranite).toContainText('라라나이트');
    await expect(laranite).toContainText('500 SCU');
    await expect(laranite).toContainText('750,000');
    await expect(laranite).toContainText('5시간 전');
    // 돌아오는 길: Area18에서 스팀 200 SCU
    await expect(laranite.locator('.routes-back')).toContainText('스팀 200 SCU');

    // 예산 줄임말: 2m → 2,000,000 → 285 SCU × 1,500 = 427,500
    await expandControls(page, 'context');
    await page.locator('#routes-budget').fill('2m');
    await expandControls(page, 'context');
    await page.locator('#routes-budget').press('Enter');
    await expect(laranite).toContainText('427,500');
    await expect(page.locator('#routes-budget')).toHaveValue('2,000,000');
    expect(await sharedState(page)).toMatchObject({ ship: 'c2-hercules', budget: 2000000, maxAgeDays: 3 });
    await expandControls(page, 'context');
    await page.locator('#routes-budget').fill('많이');
    await expandControls(page, 'context');
    await page.locator('#routes-budget').press('Enter');
    await expect(page.locator('#routes-budget-hint')).toContainText('읽을 수 없는 값');

    // 출처·게임 버전·가격 나이
    await expect(app(page).locator('.routes-sources')).not.toContainText('게임 버전');
    await expect(app(page).locator('.routes-sources')).toContainText('UEX 이용자 보고');
    // 3일 넘은 보고(알루미늄 Area18)와 불법 상품은 기본으로 빠진다.
    await expect(page.locator('#routes-table tr[data-route="85-12"]')).not.toContainText('오소이안');
    await expect(app(page).locator('.routes-count')).toContainText('오래된 가격 보고 1건');
    expect(errors).toEqual([]);
});

test('무역 경로: 좁히기, 상품 숨기기, 불법 상품 보기, 가격 기준 바꾸기', async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page, { state: C2 });
    await gotoSection(page, '#routes');
    await expect(rows(page)).toHaveCount(4); // 라라나이트, 알루미늄(L4), 아그리슘, 돌아오는 스팀

    await expandControls(page, 'filters');
    await page.locator('#routes-good').selectOption('5');
    await expect(rows(page)).toHaveCount(1);
    await expect(page).toHaveURL(/#routes\?c=5$/);
    await expandControls(page, 'filters');
    await page.locator('#routes-clear').click();
    await expect(rows(page)).toHaveCount(4);
    await expect(page).toHaveURL(/#routes$/);

    await page.locator('#routes-st').check();
    await expect(rows(page)).toHaveCount(1); // 정거장끼리는 ARC-L1 → ARC-L4 뿐
    await expect(page).toHaveURL(/st=1/);
    await page.locator('#routes-st').uncheck();

    // 한 번에 숨기기 → 모든 계산에서 빠지고, 칩으로 되돌린다. 새로 고쳐도 남는다.
    await page.locator('#routes-row-1-12-hide-47').click();
    await expect(page.locator('#routes-table tr[data-route="1-12"]')).toHaveCount(0);
    await expect(page.locator('#routes-unhide-47')).toBeFocused();
    await page.reload();
    await page.waitForSelector('#loading-splash', { state: 'hidden' });
    await expect(page.locator('#routes-unhide-47')).toContainText('라라나이트'); // 숨긴 상품도 한글 패치 이름으로
    await expandControls(page, 'filters');
    await page.locator('#routes-unhide-47').click();
    await expect(page.locator('#routes-table tr[data-route="1-12"]')).toBeVisible();

    // 불법 상품도 보기
    await page.locator('#routes-count summary').click();
    await page.locator('#routes-show-illegal').click();
    await expect(page.locator('#routes-legal')).not.toBeChecked();
    await expect(page.locator('#routes-table tr[data-route="85-12"]')).toContainText('오소이안 가죽');
    await expect(page.locator('#routes-table tr[data-route="85-12"] .routes-tag.is-illegal')).toBeVisible();

    // 가격 기준을 7일로 늘리면 5일 전 보고도 쓴다.
    await expandControls(page, 'context');
    await page.locator('#routes-age').selectOption('7');
    expect((await sharedState(page)).maxAgeDays).toBe(7);
    await expandControls(page, 'filters');
    await page.locator('#routes-good').selectOption('5');
    await expect(rows(page)).toHaveCount(2);
    await expect(page.locator('#routes-table tr[data-route="1-12"]')).toContainText('알루미늄');
    await expect(page.locator('#routes-table tr[data-route="1-12"] .routes-age.is-ok')).toContainText('5일 전');
    await expandControls(page, 'filters');
    await page.locator('#routes-good').selectOption('');

    // 상자 크기를 줄이면 실을 수 있는 양이 달라진다.
    for (const size of [1, 2, 4, 8, 16, 24]) await page.locator(`#routes-box-${size}`).uncheck();
    await expect(app(page).locator('.routes-hold')).toContainText('640 SCU');
    expect((await sharedState(page)).boxes).toEqual([32]);
});

test('무역 경로: 경로 자세히 — 이익·돈·시간, 순서 표시, 내 가격, 함선 비교, 다음 경로, 주소 복사', async ({ page, context }) => {
    const errors = trackConsoleErrors(page);
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page, { state: { ...C2, budget: 2000000 } });
    await gotoSection(page, '#routes');
    await page.locator('#routes-open-1-12').click();
    const detail = page.locator('#routes-detail');
    await expect(detail).toBeVisible();
    await expect(page.locator('#routes-detail-title')).toBeFocused();
    await expect(page).toHaveURL(/d=1\.12/);

    // 이익 · 드는 돈 · 시간과 그 까닭
    await expect(detail.locator('.routes-part').nth(0)).toContainText('427,500 aUEC');
    await expect(detail.locator('.routes-part').nth(0)).toContainText('가진 돈으로 285 SCU까지');
    await expect(detail.locator('.routes-part').nth(1)).toContainText('1,995,000 aUEC');
    await expect(detail.locator('.routes-part').nth(2)).toContainText('추정');
    await expect(detail.locator('.routes-part').nth(2)).toContainText('자동 적재');
    // 까닭 옆의 링크는 그 설정으로 데려간다.
    await detail.locator('.routes-part').nth(2).getByRole('button', { name: '시간 설정 바꾸기' }).last().click();
    await expect(page.locator('#routes-time')).toHaveAttribute('open', '');
    await expect(page.locator('#routes-time-takeoffSeconds')).toBeFocused();

    // 순서 표시는 이 브라우저에 남는다.
    await expect(detail.locator('.routes-plan > li')).toHaveCount(8);
    await expect(detail.locator('.routes-plan')).toContainText('상자:');
    await expect(detail.locator('.routes-plan')).toContainText('2시간 전');
    await page.locator('#routes-step-buy').check();
    await expect(page.locator('#routes-plan-count')).toContainText('1 / 8');
    expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem('volt-routes-steps-v1')))).toEqual({ '1.12': ['buy'] });

    // 연료
    await expect(detail.locator('.routes-fuel').first()).toBeVisible();

    // 내 터미널에는 다른 값이 보여요: 파는 값 8,500 → 9,000 이면 285 × 2,000 = 570,000
    await page.locator('#routes-diff-1-12-47').click();
    await expect(page.locator('#routes-my-buy')).toBeFocused();
    await page.locator('#routes-my-sell').fill('9000');
    await page.locator('#routes-my-save').click();
    await expect(detail.locator('.routes-part').nth(0)).toContainText('570,000 aUEC');
    await expect(detail.locator('.routes-tag.is-mine').first()).toContainText('내가 본 값');
    expect(Object.keys(await page.evaluate(() => JSON.parse(window.localStorage.getItem('volt-routes-myprices-v1'))))).toEqual(['12:47:s']);
    await page.locator('#routes-diff-1-12-47').click();
    await page.locator('#routes-my-clear').click();
    await expect(detail.locator('.routes-part').nth(0)).toContainText('427,500 aUEC');

    // 다른 함선 비교, 내 함선으로 바꾸기
    await expect(page.locator('#routes-compare tbody tr.is-selected')).toContainText('내 함선');
    await page.locator('#routes-compare-toggle').click();
    await page.locator('#routes-use-hull-c').click();
    await expect.poll(async () => (await sharedState(page)).ship).toBe('hull-c');
    await expect(page.locator('#routes-compare tbody tr.is-selected')).toContainText(/Hull C|헐 C/);

    // 도착한 뒤 이어 갈 경로 → 그 경로로 넘어간다.
    await expect(page.locator('#routes-next-12-1')).toContainText('출발지로 돌아감');
    // 다른 화면으로 넘기는 링크
    await expect(detail.locator('a[href="#market?c=47&tab=prices"]')).toBeVisible();
    await expect(detail.locator('a[href="#routes?stops=1%2C12&tab=tour"]')).toBeVisible();
    await expect(detail.locator('a[href="#hauling"]')).toBeVisible();

    // 주소 복사
    await page.locator('#routes-share').click();
    await expect(page.locator('#routes-notice')).toContainText('주소를 복사했습니다');
    // 복사한 주소에는 받은 사람이 같은 숫자를 보도록 함선·예산이 함께 들어간다.
    expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/#routes\?b=2000000&d=1\.12&ship=hull-c$/);

    await page.locator('#routes-next-12-1').click();
    await expect(page).toHaveURL(/d=12\.1/);
    await expect(page.locator('#routes-detail-title')).toContainText('ARC-L1');
    await page.goBack();
    await expect(page).toHaveURL(/d=1\.12/);
    await expect(page.locator('#routes-detail-title')).toContainText('Area18');
    await page.locator('#routes-close').click();
    await expect(detail).toHaveCount(0);
    await expect(page).toHaveURL(/#routes$/);
    expect(errors).toEqual([]);
});

test('무역 경로: 시간 설정을 바꾸면 걸리는 시간이 바뀌고 공용 저장소에 바뀐 값만 남는다', async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page, { state: C2 });
    await gotoSection(page, '#routes?d=1.4');
    const time = page.locator('#routes-detail .routes-part').nth(2).locator('.routes-big');
    const before = await time.textContent();
    await page.locator('#routes-time > summary').click();
    await expect(page.locator('#routes-time')).toContainText('우리가 정한 기본값');
    await page.locator('#routes-time-landingSeconds').fill('1800');
    await page.locator('#routes-time-landingSeconds').press('Tab');
    await expect(time).not.toHaveText(before);
    expect((await sharedState(page)).time).toEqual({ landingSeconds: 1800 });
    await page.locator('#routes-time-loading').selectOption('manual');
    await expect(page.locator('#routes-detail .routes-part').nth(2)).toContainText('항상 손으로');
    await page.locator('#routes-time-reset').click();
    await expect(time).toHaveText(before);
    expect((await sharedState(page)).time).toEqual({});
});

test('무역 경로: 다른 화면이 보낸 주소(from·to·c)를 열고, 모르는 번호는 조용히 무시한다', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page, { state: C2 });
    await gotoSection(page, '#routes?from=1&to=12');
    await expect(page.locator('#routes-detail-title')).toContainText('Area18');
    await expect(page.locator('#routes-from')).toHaveValue('1');
    // 자세히를 보는 동안 순위표는 감춰 두고, 닫으면 다시 보인다. 닫은 뒤에는 새로 고쳐도 다시 열리지 않는다.
    await expect(page.locator('#routes-app .routes-results')).toBeHidden();
    await page.locator('#routes-close').click();
    await expect(rows(page)).toHaveCount(1);
    await expect(page).toHaveURL(/#routes\?d=0&from=1&to=12$/);
    await page.reload();
    await page.waitForSelector('#loading-splash', { state: 'hidden' });
    await expect(rows(page)).toHaveCount(1);
    await expect(page.locator('#routes-detail')).toHaveCount(0);

    await page.evaluate(() => window.VOLT_HELPER.go('routes', { c: 5 }));
    await expect(page.locator('#routes-detail')).toHaveCount(0);
    await expect(page.locator('#routes-good')).toHaveValue('5');
    await expect(rows(page)).toHaveCount(1);

    await page.evaluate(() => window.VOLT_HELPER.go('routes', { c: 99999, from: 77777, d: '5.6', sort: 'nonsense', zzz: 1 }));
    await expect(page.locator('#routes-detail')).toContainText('찾을 수 없습니다');
    await page.locator('#routes-close').click();
    await expect(rows(page)).toHaveCount(4);
    await expect(page.locator('#routes-count')).toBeFocused(); // 돌아갈 줄이 없으면 목록 머리에 초점
    expect(errors).toEqual([]);
});

test('무역 경로: 가격을 못 받아도 내 조건과 게임 자료는 남고, 다시 시도할 수 있다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    let fail = true;
    const data = fixtures();
    await prepare(page, {
        state: C2,
        market: (route) => (fail ? route.fulfill({ status: 503, json: { error: 'UEX API request failed' } }) : route.fulfill({ json: { status: 'ok', data: data.market, meta: { fetchedAt: new Date().toISOString() } } })),
    });
    await gotoSection(page, '#routes');
    await expect(app(page).locator('[data-routes-price-error="unavailable"]')).toContainText('UEX 가격을 받아 올 수 없습니다');
    await expect(page.locator('#routes-ship')).toHaveValue('c2-hercules');
    await expect(app(page).locator('.routes-hold')).toContainText('696 SCU');
    await expect(app(page).locator('.routes-sources')).not.toContainText('게임 버전');
    fail = false;
    await page.locator('#routes-retry').click();
    await expect(rows(page)).toHaveCount(4);
});

test('무역 경로: 로그인이 필요한 가격(401)은 안내만 보여 준다', async ({ page }) => {
    await prepare(page, { state: C2, market: (route) => route.fulfill({ status: 401, json: { error: 'login required' } }) });
    await gotoSection(page, '#routes');
    await expect(app(page).locator('[data-routes-price-error="login"]')).toContainText('로그인이 필요합니다');
    await expandControls(page, 'context');
    await expect(page.locator('#routes-ship')).toBeVisible();
});

test('Trade routes: English at 375px, no sideways scroll, keyboard reaches the detail', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.setViewportSize({ width: 375, height: 812 });
    await prepare(page, { lang: 'en', state: { ...C2, budget: 2000000 } });
    await gotoSection(page, '#routes');
    await expect(rows(page)).toHaveCount(4);
    await expect(app(page)).toContainText('My settings');
    await expect(page.locator('#routes-table tr[data-route="1-12"]')).toContainText('Laranite');
    await expect(page.locator('#routes-table tr[data-route="1-12"]')).toContainText('5 h ago');
    expect(await sideways(page)).toBeLessThanOrEqual(1);

    await page.locator('#routes-open-1-12').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#routes-detail-title')).toBeFocused();
    await expect(page.locator('#routes-detail')).toContainText('Money needed');
    await expect(page.locator('#routes-detail')).toContainText('What this calculation assumes');
    await expandControls(page, 'context');
    await page.locator('#routes-options > summary').click();
    await page.locator('#routes-time > summary').click();
    expect(await sideways(page)).toBeLessThanOrEqual(1);
    for (const box of await page.locator('#routes-app :is(button, select, input[type="text"], summary, a.routes-btn)').evaluateAll((nodes) => nodes.filter((node) => node.getClientRects().length).map((node) => ({ id: node.id || node.textContent.trim().slice(0, 30), h: node.getBoundingClientRect().height })))) {
        expect(box.h, `터치 영역: ${box.id}`).toBeGreaterThanOrEqual(43.5);
    }

    // 가득 찼다고 보고된 판매처는 경고한다.
    await page.evaluate(() => window.VOLT_HELPER.go('routes', { d: '85.12' }));
    await expect(page.locator('#routes-detail')).toContainText('reported full');
    // 언어를 바꾸면 화면도 바뀐다.
    await page.evaluate(() => window.VOLT_I18N.setLang('ko'));
    await expect(page.locator('#routes-detail')).toContainText('가득 찼다고 보고');
    expect(errors).toEqual([]);
});

test('무역 경로: 접근성 검사 (목록 + 자세히)', async ({ page }) => {
    test.setTimeout(90000);
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page, { state: { ...C2, budget: 2000000 } });
    await gotoSection(page, '#routes?d=1.12');
    await expect(page.locator('#routes-detail')).toBeVisible();
    await expandControls(page, 'context');
    await page.locator('#routes-options > summary').click();
    await page.locator('#routes-time > summary').click();
    const results = await new AxeBuilder({ page }).include('#routes-app').analyze();
    expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`)).toEqual([]);
});

test('무역 경로: SCU당 이익이 큰 상품이 조금뿐이어도, 더 많이 버는 짐을 고른다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const data = fixtures();
    const now = Math.floor(Date.now() / 1000);
    // ARC-L1 → Area18: 아그리슘은 SCU당 2,000 이익이지만 재고 10뿐(20,000). 라라나이트는 SCU당 1,500 × 500 = 750,000.
    const market = [...data.market, { t: 1, c: 1, buy: 8000, stock: 10, sb: 1, box: ALL_BOXES, at: now - 2 * HOUR }];
    await prepare(page, { state: C2, market: (route) => route.fulfill({ json: { status: 'ok', data: market, meta: { fetchedAt: new Date().toISOString() } } }) });
    await gotoSection(page, '#routes');
    const row = page.locator('#routes-table tr[data-route="1-12"]');
    await expect(row).toContainText('라라나이트');
    await expect(row).toContainText('750,000');
    await expect(row).not.toContainText('아그리슘');
    // 자세히도 같은 짐, 같은 숫자
    await page.locator('#routes-open-1-12').click();
    await expect(page.locator('#routes-detail .routes-part').nth(0)).toContainText('750,000 aUEC');
    await expect(page.locator('#routes-detail .routes-assume')).toContainText('한 가지만 실었을 때 이익이 가장 큰 것');
    // 두 가지를 싣게 하면 둘 다 싣는다: 20,000 + 750,000
    await expandControls(page, 'context');
    await page.locator('#routes-options > summary').click();
    await page.locator('#routes-goods').selectOption('2');
    await expect(page.locator('#routes-detail .routes-part').nth(0)).toContainText('770,000 aUEC');
    await page.locator('#routes-close').click();
    await expect(row).toContainText('770,000');
    // 가장 잘 맞는 함선은 표를 먼저 보여 준 뒤 채운다.
    await expect(page.locator('#routes-table [data-hint]:not([data-done])')).toHaveCount(0);
    await expect(row.locator('.routes-best')).not.toContainText('계산 중');
});

test('무역 경로: 잘못 넣은 내 가격으로 경로가 사라져도 화면에 보이고 지울 수 있다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page, { state: C2 });
    await gotoSection(page, '#routes?d=1.12');
    await page.locator('#routes-diff-1-12-47').click();
    await page.locator('#routes-my-buy').fill('99999'); // 사는 값이 파는 값보다 비싸다: 이익이 없어진다
    await page.locator('#routes-my-save').click();
    await expect(page.locator('#routes-detail [data-routes-nothing]')).toContainText('내가 넣은 가격으로 계산하면');
    await expect(page.locator('#routes-dmine-0')).toBeFocused();
    await expect(page.locator('#routes-mine-0')).toContainText('라라나이트');
    await expect(page.locator('#routes-mine-0')).toContainText('99,999');
    // 새로 고쳐도 보이고, 목록에서도 보인다.
    await page.reload();
    await page.waitForSelector('#loading-splash', { state: 'hidden' });
    await page.locator('#routes-close').click();
    await expect(rows(page)).toHaveCount(3);
    await expect(page.locator('#routes-table tr[data-route="1-12"]')).toHaveCount(0);
    await expandControls(page, 'filters');
    await page.locator('#routes-mine-0').click();
    await expect(page.locator('#routes-table tr[data-route="1-12"]')).toContainText('750,000');
    await expect(page.locator('#routes-mine-0')).toHaveCount(0);
    expect(await page.evaluate(() => window.localStorage.getItem('volt-routes-myprices-v1'))).toBe('{}');
});

test('무역 경로: 복사한 주소를 처음 온 사람이 열면 같은 숫자를 보고, 그 사람의 조건은 바뀌지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await prepare(page); // 저장된 함선 없음
    await gotoSection(page, '#routes?b=2000000&d=1.12&ship=c2-hercules');
    await expect(page.locator('#routes-detail .routes-part').nth(0)).toContainText('427,500 aUEC');
    await expect(page.locator('#routes-link-banner')).toContainText('받은 주소에 들어 있는 조건');
    await expect(page.locator('#routes-ship')).toBeDisabled();
    expect((await sharedState(page))?.ship ?? null).toBe(null);
    await page.locator('#routes-link-drop').click();
    await expect(page.locator('#routes-link-banner')).toHaveCount(0);
    await expect(page.locator('#routes-detail [data-routes-problem="no-ship"]')).toBeVisible();
    await expect(page).toHaveURL(/#routes\?d=1\.12$/);
});

test('무역 경로: 상품 이름을 못 받아도 목록이 비지 않고, 새로 받기에 실패해도 보던 가격이 남는다', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    const data = fixtures();
    let names = 'fail';
    let prices = 'ok';
    await prepare(page, {
        state: C2,
        market: (route) => (prices === 'ok' ? route.fulfill({ json: { status: 'ok', data: data.market, meta: { fetchedAt: new Date().toISOString() } } }) : route.fulfill({ status: 503, json: { error: 'down' } })),
    });
    await page.route('**/api/uex/commodities', (route) => (names === 'fail' ? route.fulfill({ status: 503, json: { error: 'down' } })
        : route.fulfill({ json: { status: 'ok', data: [null, ...data.commodities, 'x'], meta: {} } })));
    await gotoSection(page, '#routes');
    await expect(rows(page)).toHaveCount(4);
    // 합법 여부를 몰라 "합법만"을 적용하지 못한다: 원래는 빠지던 53번(오소이안 가죽)이 Shubin → Area18 줄에 나온다.
    await expect(page.locator('#routes-table tr[data-route="85-12"]')).toContainText('상품 53번');
    await expect(page.locator('#routes-legal-off')).toContainText('적용할 수 없습니다');
    await expect(page.locator('#routes-table tr[data-route="1-12"]')).toContainText('합법 여부 모름');
    names = 'ok'; // 빈 칸(null)이 섞인 응답도 견딘다
    await page.locator('#routes-names-retry').click();
    await expect(page.locator('#routes-legal-off')).toHaveCount(0);
    await expect(rows(page)).toHaveCount(4);
    await expect(page.locator('#routes-table tr[data-route="1-12"]')).toContainText('라라나이트');

    prices = 'fail';
    await page.locator('#routes-refresh').click();
    await expect(page.locator('#routes-refresh-error')).toContainText('앞서 받은 가격을 그대로');
    await expect(rows(page)).toHaveCount(4);
    await expect(app(page).locator('.routes-sources')).toContainText('UEX 이용자 보고');
    expect(errors.filter((text) => !/503/.test(text))).toEqual([]);
});

test('Trade routes: closing the detail returns to the same place; cards say estimate; ticked steps pass axe', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 560 });
    await prepare(page, { lang: 'en', state: { ...C2, budget: 2000000 } });
    await gotoSection(page, '#routes');
    await expect(rows(page)).toHaveCount(4);
    const last = rows(page).nth(3);
    await expect(last.locator('.routes-est:visible').first()).toBeVisible(); // 카드에서도 "estimate" 표시가 보인다
    const open = last.locator('.routes-open');
    await open.scrollIntoViewIfNeeded();
    const id = await open.getAttribute('id');
    const before = await page.evaluate(() => window.scrollY);
    expect(before).toBeGreaterThan(300);
    await open.click();
    await expect(page.locator('#routes-detail-title')).toBeFocused();
    await expect(page.locator('#routes-detail-title')).toBeInViewport();
    await page.locator('#routes-detail .routes-plan input[type="checkbox"]').first().check();
    await expect(page.locator('#routes-detail .routes-plan > li.is-done')).toHaveCount(1);
    const results = await new AxeBuilder({ page }).include('#routes-app').analyze();
    expect(results.violations.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(' | ')}`)).toEqual([]);
    await page.locator('#routes-close-bottom').click();
    await expect(page.locator(`#${id}`)).toBeFocused();
    await expect(page.locator(`#${id}`)).toBeInViewport();
    expect(await page.evaluate(() => window.scrollY)).toBe(before);
    // 예산 0 과 읽을 수 없는 화물칸 값은 까닭을 말해 준다.
    await expandControls(page, 'context');
    await page.locator('#routes-budget').fill('0');
    await expandControls(page, 'context');
    await page.locator('#routes-budget').press('Enter');
    await expect(app(page).locator('[data-routes-empty]')).toContainText('Your money to spend is 0');
    await expandControls(page, 'context');
    await page.locator('#routes-options > summary').click();
    await expandControls(page, 'context');
    await page.locator('#routes-capacity').fill('abc');
    await expandControls(page, 'context');
    await page.locator('#routes-capacity').press('Enter');
    await expect(page.locator('#routes-capacity-hint')).toContainText('could not be read');
});

test('무역 경로: 로그인이 필요하면 로그인 버튼을 함께 보여 준다', async ({ page }) => {
    await prepare(page, { state: C2, market: (route) => route.fulfill({ status: 401, json: { error: 'login required' } }) });
    await gotoSection(page, '#routes');
    await expect(page.locator('#routes-login')).toHaveAttribute('href', '/auth/discord/login?returnTo=%2F%23routes');
    await expect(page.locator('#routes-retry')).toBeVisible();
});

test('갤럭시 카고 모듈을 경로와 플래너에서 장착하고 해제한다', async ({ page }) => {
    await mockApi(page, { loggedIn: true, fleet: true });
    await gotoSection(page, '#routes');
    const selector = page.locator('#routes-ship');
    if (!(await selector.isVisible())) await page.locator('#routes-context-title').click();
    await selector.selectOption('galaxy');
    const module = page.locator('#routes-module');
    await module.selectOption('galaxy-cargo');
    await expect(page.locator('.routes-hold')).toContainText('720 SCU');
    await gotoSection(page, '#trade-planner');
    await page.locator('#logistics-ship-search').fill('galaxy');
    await page.locator('[data-planner-ship-id="galaxy"]').click();
    await expect(page.locator('#planner-cargo-module')).toHaveValue('galaxy-cargo');
    await expect(page.locator('#logistics-cargo')).toHaveValue('720');
    await page.locator('#planner-cargo-module').selectOption('');
    await expect(page.locator('#logistics-cargo')).toHaveValue('64');
    await gotoSection(page, '#routes');
    if (!(await selector.isVisible())) await page.locator('#routes-context-title').click();
    await expect(module).toHaveValue('');
    await expect(page.locator('.routes-hold')).toContainText('64 SCU');
});
