const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const AxeBuilder = require('@axe-core/playwright').default;
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

// 채광 안내 추가 화면: 장소 목록(아이콘·칩·표·광물×장소), 신호 찾기, 정제소 찾기, CSV·주소 복사.
// 개발 서버에는 Functions 가 없으므로 /api/uex/* 는 실제 응답 모양의 작은 자료로 대신한다.

const STRICT_CSP = [
    "default-src 'self'", "base-uri 'self'", "frame-ancestors 'none'", "form-action 'self' https://forms.gle",
    "img-src 'self' data: https:", "script-src 'self' https://static.cloudflareinsights.com", "style-src 'self'",
    "connect-src 'self' https://cloudflareinsights.com", "font-src 'self' data:", "object-src 'none'",
].join('; ');
const DAY = 86400;
const now = () => Math.floor(Date.now() / 1000);

function refineryFixture() {
    const at = now() - 25 * DAY;
    return {
        methods: [
            { id: 1, name: 'Cormack', code: 'COR', yield: 1, cost: 2, speed: 3 },
            { id: 2, name: 'Dinyx Solventation', code: 'DIN', yield: 3, cost: 1, speed: 1 },
        ],
        commodities: { 34: 'Gold (Ore)', 59: 'Quantainium (Raw)', 125: 'Ice (Raw)', 181: 'Construction Material Rubble' },
        yields: [
            { t: 246, c: 34, v: -3, at }, { t: 246, c: 59, v: 3, at },
            { t: 247, c: 34, v: 7, at }, { t: 247, c: 59, v: 3, at: now() - 2 * DAY },
            { t: 788, c: 34, v: 5, at }, { t: 788, c: 125, v: -9, at },
            { t: 245, c: 34, v: -6 },
        ],
    };
}
const TERMINALS = [
    { id: 245, type: 'refinery', name: 'Refinement Processing - CRU-L1', nick: 'CRU-L1', live: true, system: 'Stanton', station: 'CRU-L1 Ambitious Dream Station' },
    { id: 246, type: 'refinery', name: 'Refinement Processing - ARC-L1', nick: 'ARC-L1', live: true, system: 'Stanton', station: 'ARC-L1 Wide Forest Station' },
    { id: 247, type: 'refinery', name: 'Refinement Processing - ARC-L2', nick: 'ARC-L2', live: true, system: 'Stanton', station: 'ARC-L2 Lively Pathway Station' },
    { id: 788, type: 'refinery', name: 'Refinement Center - Levski', nick: 'Levski', live: true, system: 'Nyx', city: 'Levski' },
    { id: 12, type: 'commodity', name: 'Admin - ARC-L1', nick: 'ARC-L1', live: true, system: 'Stanton' },
];

async function openMining(page, hash = '#mining', { refineries = refineryFixture(), market = [] } = {}) {
    await mockApi(page, { fleet: true });
    await page.route('**/api/uex/commodities', (route) => route.fulfill({ json: { status: 'ok', data: [{ id: 33, name: 'Gold', price_sell: 28870 }, { id: 60, name: 'Quantainium', price_sell: 148409 }] } }));
    await page.route('**/api/uex/market*', (route) => route.fulfill({ json: { status: 'ok', data: market, meta: { source: 'uex', fetchedAt: new Date().toISOString() } } }));
    await page.route('**/api/uex/refineries*', (route) => route.fulfill({ json: { status: 'ok', data: refineries, meta: { source: 'uex', fetchedAt: new Date().toISOString() } } }));
    await page.route('**/api/uex/terminals*', (route) => route.fulfill({ json: { status: 'ok', data: TERMINALS, meta: { source: 'uex' } } }));
    await gotoSection(page, hash);
    await expect(page.locator('#mining-app .mining-toolbar')).toBeVisible();
}

test('장소 목록: 할 수 있는 일 아이콘, 쓰는 곳, 함께 쓰는 목록 안내, 쓰는 곳 없는 목록과 행사 목록 표시', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await openMining(page, '#mining?tab=location');
    const hurston = page.locator('.mining-place[data-mining-location="Stanton1"]');
    await expect(hurston.locator('.mining-tag.is-ship svg')).toHaveCount(1);
    await expect(hurston.locator('.mining-tag')).toHaveText(['함선 채광', '지상 차량 채광', '손 채광', '채집']);
    await expect(page.locator('.mining-place[data-mining-location="AaronHalo"] .mining-tag')).toHaveText(['함선 채광', '잔해 수거']);
    // 라그랑주 목록은 실제 게임 안 장소 이름을 함께 적는다.
    await expect(page.locator('.mining-place[data-mining-location="Lagrange_A"]')).toContainText('게임 안 장소: HUR L1, HUR L4');
    // 쓰는 곳을 찾지 못한 목록은 따로 묶고 경고를 붙인다.
    const unplaced = page.locator('.mining-system', { hasText: '쓰는 곳을 찾지 못한 목록' });
    await expect(unplaced.locator('.mining-place')).toHaveCount(2);
    await expect(unplaced).toContainText('갈 수 있는 장소가 아닐 수 있습니다');
    // 행사·동굴 목록은 눌러야 나오고 "지금 없을 수 있음"이 붙는다.
    await expect(page.locator('.mining-place[data-mining-location="ResourceRush_Gold"]')).toHaveCount(0);
    await page.locator('#mining-sites-toggle').click();
    await expect(page.locator('#mining-sites-toggle')).toBeFocused();
    const event = page.locator('.mining-place[data-mining-location="ResourceRush_Gold"]');
    await expect(event).toContainText('지금 없을 수 있음');
    await event.click();
    await expect(page.locator('.mining-detail')).toContainText('지금 게임에서 열려 있는지는 게임 파일로 알 수 없습니다');
    await expect(page.locator('.mining-detail')).toContainText('Mining_AsteroidGoldOnly');
    // 함께 쓰는 목록: 옐라 소행성대는 파이로의 터미너스에서도 쓴다.
    await page.locator('.mining-place[data-mining-location="Stanton2c_Belt"]').click();
    const detail = page.locator('.mining-detail');
    await expect(detail).toContainText('터미너스 [Terminus] (Pyro)');
    await expect(detail).toContainText('이 목록은 위 장소들이 함께 씁니다');
    // 희귀 암석 표.
    await expect(page.locator('.mining-special')).toContainText('행사·시설 전용');
    expect(errors).toEqual([]);
});

test('장소 상세: 신호 값과 무리 개수, 식물, 잔해, 품질 값, 지형 보정값', async ({ page }) => {
    await openMining(page, '#mining?tab=location&loc=Stanton1');
    const detail = page.locator('.mining-detail');
    await expect(detail.locator('h3')).toContainText('허스턴');
    // 차량 채광 암석은 모두 4,000, 손 채광 암석은 모두 3,000 (게임 파일 값).
    await expect(detail.locator('.mining-group', { hasText: '지상 차량 채광' }).first().locator('tbody tr').first()).toContainText('4,000');
    await expect(detail.locator('thead').first()).toContainText('한 무리 개수');
    const plants = detail.locator('.mining-group', { hasText: '채집할 수 있는 식물' });
    await expect(plants).toContainText('프로타');
    await expect(plants).toContainText('2,000');
    await expect(plants).toContainText('식물 아님');
    await expect(detail).toContainText('품질이 이 숫자들에서 어떻게 정해지는지는 게임 자료에 없습니다');
    await expect(detail).toContainText('지형별 보정값 (뜻 미확인)');
    // 잔해가 있는 곳.
    await page.goto('/#mining?tab=location&loc=AaronHalo');
    await expect(detail.locator('h3')).toContainText('아론 헤일로');
    const salvage = detail.locator('.mining-group', { hasText: '잔해 하나에서 나오는 자재 양은 게임 자료에 없습니다' });
    await expect(salvage.locator('caption').first()).toContainText('통째 잔해');
    await expect(salvage).toContainText('고철 더미');
    // 고정 자리 목록(동굴): 어느 동굴인지 모른다고 적는다.
    await page.goto('/#mining?tab=location&loc=Cave_Prison_Harvestables');
    await expect(detail).toContainText('어느 동굴·시설에 쓰이는지는 확인하지 못했습니다');
    await expect(detail).toContainText('깊은 곳');
});

test('종류·성계 칩은 포함 → 제외 → 상관없음으로 돌고 주소에 남는다', async ({ page }) => {
    await openMining(page, '#mining?tab=location');
    const total = await page.locator('.mining-place').count();
    const pyro = page.locator('[data-mining-chip="sys"][data-mining-chip-id="Pyro"]');
    await pyro.click();
    await expect(pyro).toHaveAttribute('aria-label', 'Pyro: 포함');
    await expect(pyro).toBeFocused();
    await expect(page.locator('.mining-place[data-mining-location="Stanton1"]')).toHaveCount(0);
    await expect(page.locator('.mining-place[data-mining-location="Pyro1"]')).toHaveCount(1);
    // 옐라 소행성대 목록은 파이로에서도 쓰므로 남는다.
    await expect(page.locator('.mining-place[data-mining-location="Stanton2c_Belt"]')).toHaveCount(1);
    await pyro.click();
    await expect(pyro).toHaveAttribute('aria-label', 'Pyro: 제외');
    await expect(page.locator('.mining-place[data-mining-location="Pyro1"]')).toHaveCount(0);
    await expect(page.locator('.mining-place[data-mining-location="Stanton1"]')).toHaveCount(1);
    await page.locator('[data-mining-chip="type"][data-mining-chip-id="moon"]').click();
    await expect(page.locator('.mining-place[data-mining-location="Stanton1"]')).toHaveCount(0);
    await expect(page.locator('.mining-place[data-mining-location="Stanton2b"]')).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#mining?sys=-Pyro&tab=location&type=moon');
    // 채집 칩: 식물이 있는 곳만.
    await page.locator('[data-mining-mode="harvest"]').click();
    await expect(page.locator('.mining-place')).toHaveCount(2);
    await expect(page.locator('.mining-place[data-mining-location="Stanton2b"]')).toHaveCount(1);
    await page.locator('[data-mining-mode=""]').click();
    await page.locator('[data-mining-chip="type"][data-mining-chip-id="moon"]').click();
    await page.locator('[data-mining-chip="type"][data-mining-chip-id="moon"]').click();
    await pyro.click();
    await expect(pyro).toHaveAttribute('aria-label', 'Pyro: 상관없음');
    await expect(page.locator('.mining-place')).toHaveCount(total);
});

test('표 보기와 CSV: 강한 CSP 에서도 data: 주소로 내려받고, 표 복사도 된다', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.route('**/*', async (route) => {
        if (route.request().resourceType() !== 'document') return route.fallback();
        const response = await route.fetch();
        await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': STRICT_CSP } });
    });
    await page.addInitScript(() => {
        window.__csp = [];
        document.addEventListener('securitypolicyviolation', (event) => window.__csp.push(`${event.violatedDirective} <- ${event.blockedURI}`));
    });
    await openMining(page, '#mining?tab=location&lay=table&sys=Nyx');
    const rows = page.locator('table[data-mining-csv="locations"] tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText('글레시엠 고리');
    await expect(rows.first().locator('.mining-tag .visually-hidden')).toHaveText(['함선 채광', '잔해 수거']);
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#mining-csv').click()]);
    expect(download.suggestedFilename()).toBe('volt-mining-locations.csv');
    const csv = fs.readFileSync(await download.path(), 'utf8');
    expect(csv.charCodeAt(0)).toBe(0xFEFF);
    const lines = csv.slice(1).split('\r\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('장소,성계,종류,할 수 있는 일,게임 안 장소,암석 종류,광물 종류,식물,잔해 묶음,함선 암석 신호 값');
    expect(lines[1]).toContain('글레시엠 고리,Nyx,소행성대,함선 채광 / 잔해 수거,');
    expect(lines[1]).toContain('"3,200–4,300"');
    await expect(page.locator('.mining-notice')).toContainText('CSV 파일을 만들었습니다');
    await page.locator('#mining-copy').click();
    await expect(page.locator('.mining-notice')).toContainText('표를 복사했습니다');
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied.split('\n')[1].split('\t').slice(0, 3)).toEqual(['글레시엠 고리', 'Nyx', '소행성대']);
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    // 묶음 보기에는 표가 없으므로 내려받기 단추도 없다.
    await page.locator('[data-mining-layout="tiles"]').click();
    await expect(page.locator('#mining-csv')).toHaveCount(0);
    // 광물 목록 표도 내려받을 수 있다: 이름 칸에 모바일용 시세 글자가 섞이지 않는다.
    await page.locator('[data-mining-view="mineral"]').click();
    const [second] = await Promise.all([page.waitForEvent('download'), page.locator('#mining-csv').click()]);
    const minerals = fs.readFileSync(await second.path(), 'utf8').slice(1).split('\r\n');
    expect(minerals[0]).toBe('광물,방식,정제 후,UEX 평균 판매 시세,최근 보고 최고 판매가 (3일 이내),불안정성,저항');
    expect(minerals[1].startsWith('퀀터늄 (원석),함선 채광,퀀터늄,148409,')).toBe(true);
});

test('광물 × 장소 표: 방식 글자가 칸에 들어가고 장소를 누르면 상세가 열린다', async ({ page }) => {
    await openMining(page, '#mining?tab=location&lay=matrix&sys=Stanton&type=planet');
    const table = page.locator('table[data-mining-csv="matrix"]');
    await expect(table.locator('thead th')).toHaveCount(3);
    const quantainium = table.locator('tbody tr', { has: page.locator('[data-mining-mineral="Raw_Quantainium"]') });
    await expect(quantainium.locator('td').first()).toHaveText('함');
    const hadanite = table.locator('tbody tr', { has: page.locator('[data-mining-mineral="Hadanite"]') });
    await expect(hadanite.locator('td').first()).toHaveText('손');
    await expect(table.locator('tbody tr', { hasText: '프로타' }).locator('td').first()).toHaveText('채');
    await expect(page.locator('.mining-list')).toContainText('빈칸은 게임 파일에 없다는 뜻입니다');
    await table.locator('thead [data-mining-location="Stanton4"]').click();
    await expect(page.locator('.mining-detail h3')).toBeFocused();
    await expect(page.locator('.mining-detail h3')).toContainText('마이크로텍');
    await expect(page.locator('[data-mining-layout="matrix"]')).toHaveAttribute('aria-pressed', 'true');
});

test('신호 찾기: 정확히 · 비슷한 값 · 범위, 확인 전 안내와 그림', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await openMining(page);
    await page.locator('[data-mining-view="sig"]').click();
    await expect(page.locator('#mining-sig-unverified')).toContainText('게임 파일에 적혀 있지 않습니다');
    await expect(page.locator('.mining-list')).toContainText('손 채광 암석은 모두 3,000');
    await expect(page.locator('.mining-sig-lane')).toHaveCount(5);
    await expect(page.locator('#mining-csv')).toHaveCount(0);
    const input = page.locator('#mining-sig-value');
    await input.pressSequentially('7170');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('7170');
    // 7170 = 금 3585 × 2 (희귀 함선 암석의 무리 개수 2~4).
    const rows = page.locator('table[data-mining-csv="signature"] tbody tr');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('3,585 × 2');
    await expect(rows.first()).toContainText('금 (광석)');
    await expect(rows.first()).toContainText('함선 채광');
    await expect(page.locator('.mining-sig-target')).toHaveCount(5);
    await expect(page.locator('.mining-sig-mark.is-hit')).toHaveCount(1);
    // 48000 은 차량 4000 × 12 와 손 3000 × 16 이 겹친다: 후보를 모두 보여 준다.
    await input.fill('48,000');
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: '4,000 × 12' })).toContainText('지상 차량 채광');
    await expect(rows.filter({ hasText: '3,000 × 16' })).toContainText('하다나이트');
    // 어느 무리 개수로도 안 나오는 값.
    await input.fill('7171');
    await expect(page.locator('#mining-sig-result')).toContainText('이 숫자가 나오지 않습니다');
    // 비슷한 값: ±50 안.
    await page.locator('[data-mining-sig-how="approx"]').click();
    await expect(page.locator('#mining-sig-tol')).toHaveValue('50');
    await expect(rows.filter({ hasText: '3,585 × 2' })).toHaveCount(1);
    // 범위.
    await page.locator('[data-mining-sig-how="range"]').click();
    await input.fill('6300');
    await page.locator('#mining-sig-to').fill('6400');
    await expect(rows.filter({ hasText: '3,170 × 2' })).toContainText('퀀터늄');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#mining?sm=range&sv=6300&sv2=6400&tab=sig');
    // 후보에서 광물 상세로 넘어간다.
    await rows.filter({ hasText: '3,170 × 2' }).locator('[data-mining-mineral="Raw_Quantainium"]').click();
    await expect(page.locator('.mining-detail h3')).toContainText('퀀터늄');
    // 영어.
    await page.locator('[data-mining-view="sig"]').click();
    await page.locator('.nav-lang [data-set-lang="en"]').click();
    await expect(page.locator('#mining-sig-unverified')).toContainText('not written in the game files');
    expect(errors).toEqual([]);
});

test('정제소 찾기: 게임 파일 목록을 바탕으로 UEX 보너스와 보고 나이, 가장 좋은 정제소, 방식 등급', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await openMining(page);
    await page.locator('[data-mining-view="ref"]').click();
    await expect(page.locator('#mining-ref-intro')).toContainText('정제 수율과 정제 시간의 실제 숫자는 게임 파일에 없습니다');
    const table = page.locator('table[data-mining-csv="refineries"]');
    // 게임 파일의 정제 시설 31곳 + UEX에만 있는 레브스키.
    await expect(table.locator('tbody tr')).toHaveCount(32);
    const arc1 = table.locator('tbody tr', { hasText: 'ARC-L1' });
    await expect(arc1).toContainText('게임 파일 · UEX 모두');
    await expect(arc1).toContainText('-3%');
    await expect(arc1).toContainText('25일 전');
    await expect(table.locator('tbody tr', { hasText: '레브스키' })).toContainText('UEX에만 있음');
    const farstat = table.locator('tbody tr', { hasText: 'PYAM-FARSTAT-1-2' });
    await expect(farstat).toContainText('게임 파일에만 있음');
    await expect(farstat.locator('td').nth(2)).toHaveText('보고 없음');
    // 보고 시각이 없는 줄은 "보고 시각 모름".
    await expect(table.locator('tbody tr', { hasText: 'CRU-L1' })).toContainText('보고 시각 모름');
    await expect(page.locator('#mining-ref-best')).toContainText('광물을 고르면');
    // 광물을 고른다: 금 + 퀀터늄 → ARC-L2 (평균 +5%).
    const gold = page.getByRole('button', { name: '금 (광석)', exact: true });
    await gold.click();
    await expect(gold).toBeFocused();
    await expect(gold).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '퀀터늄 (원석)', exact: true }).click();
    const best = page.locator('#mining-ref-best');
    await expect(best.locator('li')).toHaveCount(1);
    await expect(best).toContainText('ARC-L2');
    await expect(best).toContainText('평균 +5% (2/2개 광물 보고)');
    await expect(best).toContainText('추정');
    await expect(table.locator('tbody tr').first()).toContainText('ARC-L2');
    await expect(table.locator('thead th')).toHaveCount(6);
    // 보고가 하나뿐인 정제소는 1/2 로 적고 보고가 다 있는 곳 뒤에 둔다.
    await expect(table.locator('tbody tr', { hasText: '레브스키' })).toContainText('1/2');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#mining?ores=34%2C59&tab=ref');
    // 방식 등급.
    const methods = page.locator('.mining-method-table');
    await expect(methods.locator('tbody tr')).toHaveCount(2);
    await expect(methods.locator('tbody tr').last()).toContainText('3 / 3');
    await expect(page.locator('.mining-list')).toContainText('어느 쪽 숫자가 좋은지는 UEX가 밝히지 않았습니다');
    await expect(page.locator('.mining-sources')).toContainText('UEX 이용자 보고');
    // 영어.
    await page.locator('.nav-lang [data-set-lang="en"]').click();
    await expect(page.locator('#mining-ref-intro')).toContainText('not in the game files');
    await expect(page.locator('#mining-ref-best')).toContainText('average +5% (2/2 minerals reported)');
    await expect(page.getByRole('button', { name: 'Gold (Ore)', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(errors).toEqual([]);
});

test('정제소 찾기: UEX 를 받지 못해도 게임 파일 목록은 남고 다시 받을 수 있다', async ({ page }) => {
    await mockApi(page, { fleet: true });
    let status = 503;
    await page.route('**/api/uex/refineries*', (route) => (status ? route.fulfill({ status, json: { error: 'x' } }) : route.fulfill({ json: { status: 'ok', data: refineryFixture(), meta: {} } })));
    await page.route('**/api/uex/terminals*', (route) => route.fulfill({ json: { status: 'ok', data: TERMINALS } }));
    await gotoSection(page, '#mining?tab=ref&ores=34');
    const table = page.locator('table[data-mining-csv="refineries"]');
    await expect(table.locator('tbody tr')).toHaveCount(31);
    await expect(page.locator('.mining-ref-error')).toContainText('지금 UEX 가격을 받아 올 수 없습니다');
    status = 0;
    await page.locator('#mining-ref-retry').click();
    await expect(table.locator('tbody tr')).toHaveCount(32);
    await expect(page.locator('#mining-ref-best')).toContainText('ARC-L2');
    // 커뮤니티 전용으로 막힌 경우(401)는 로그인 안내.
    status = 401;
    await page.reload();
    await expect(page.locator('.mining-ref-error')).toContainText('로그인');
    await expect(table.locator('tbody tr')).toHaveCount(31);
});

test('광물 상세: 보고 시각이 있는 최근 가격과 시세 화면 연결, 정제소 찾기로 넘어가기', async ({ page }) => {
    const market = [
        { t: 12, c: 33, sell: 30100, at: now() - 2 * 3600 },
        { t: 13, c: 33, sell: 99999, at: now() - 9 * DAY },
        { t: 14, c: 33, buy: 50000, at: now() - 3600 },
    ];
    await openMining(page, '#mining?m=Ore_Gold', { market });
    const line = page.locator('.mining-market');
    await expect(line).toContainText('최근 보고 최고 판매가 (3일 이내)');
    await expect(line).toContainText('30,100');
    await expect(line).toContainText('2시간 전');
    await expect(line.locator('a')).toHaveAttribute('href', '#market?c=33');
    await expect(page.locator('.mining-list')).toContainText('보고 시각이 따로 없습니다');
    await expect(page.locator('.mining-panel')).toContainText('품질 분포 (게임 파일 값)');
    await page.locator('#mining-refine-go').click();
    await expect(page.locator('#mining-view-ref')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: '금 (광석)', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#mining-ref-best')).toContainText('ARC-L2');
});

test('주소 복사와 주소로 열기: 같은 화면이 다시 나오고, 모르는 값은 조용히 무시한다', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = trackConsoleErrors(page);
    await openMining(page);
    await page.locator('[data-mining-view="location"]').click();
    await page.locator('[data-mining-layout="table"]').click();
    await page.locator('#mining-search').fill('yela');
    await page.locator('#mining-share').click();
    await expect(page.locator('.mining-notice')).toContainText('주소를 복사했습니다');
    const link = await page.evaluate(() => navigator.clipboard.readText());
    expect(link).toMatch(/#mining\?lay=table&q=yela&tab=location$/);
    await page.goto('/#hauling');
    await page.goto(link);
    await expect(page.locator('#mining-search')).toHaveValue('yela');
    await expect(page.locator('table[data-mining-csv="locations"] tbody tr')).toHaveCount(2);
    // 같은 쪽에서 주소만 바뀌어도 따라간다.
    await page.evaluate(() => { location.hash = '#mining?tab=sig&sv=7170'; });
    await expect(page.locator('table[data-mining-csv="signature"] tbody tr')).toHaveCount(1);
    // 값 없는 #mining (메뉴에서 다시 누름)은 지금 화면을 그대로 둔다.
    await page.evaluate(() => { location.hash = '#mining'; });
    await expect(page.locator('#mining-view-sig')).toHaveAttribute('aria-selected', 'true');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#mining?sv=7170&tab=sig');
    // 모르는 키·값.
    await page.goto('/#mining?tab=nope&m=Nothing&loc=Nowhere&mode=x&lay=y&type=zzz&ores=a,b&zz=1');
    await page.reload();
    await expect(page.locator('#mining-view-mineral')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.mining-list tbody tr').first()).toBeVisible();
    await expect(page.locator('.mining-hint')).toBeVisible();
    expect(errors).toEqual([]);
});

const VIEWS = [
    ['장소 묶음', '#mining?tab=location&loc=Stanton1'],
    ['장소 표', '#mining?tab=location&lay=table'],
    ['광물 × 장소', '#mining?tab=location&lay=matrix'],
    ['신호 찾기', '#mining?tab=sig&sv=48000&sm=approx&st=200'],
    ['정제소 찾기', '#mining?tab=ref&ores=34,59'],
];
for (const width of [375, 1440]) {
    for (const [name, hash] of VIEWS) {
        test(`추가 화면 ${name}: ${width}px 에서 넘치지 않고 접근성 위반이 없다`, async ({ page }) => {
            await page.setViewportSize({ width, height: 900 });
            await openMining(page, hash);
            if (hash.includes('tab=ref')) await expect(page.locator('#mining-ref-best li').first()).toBeVisible();
            await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
            const small = await page.locator('#mining-app button:visible').evaluateAll((buttons) => buttons
                .filter((button) => !button.classList.contains('mining-rowbtn'))
                .filter((button) => button.getBoundingClientRect().height < 43.5).map((button) => button.id || button.className));
            expect(small).toEqual([]);
            const results = await new AxeBuilder({ page }).include('#mining').analyze();
            expect(results.violations.filter((v) => ['critical', 'serious'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
        });
    }
}

// ── 검증에서 나온 문제의 되풀이 방지 ─────────────────────────────────────────
test('신호 찾기: 암석 하나(× 1)는 언제나 후보이고, 무리 개수에 없는 값은 참고로만 보여 준다', async ({ page }) => {
    await openMining(page, '#mining?tab=sig&sv=3170');
    const rows = page.locator('table[data-mining-csv="signature"] tbody tr');
    await expect(rows.filter({ hasText: '3,170 × 1' })).toContainText('퀀터늄');
    await expect(page.locator('#mining-sig-result')).toContainText('후보');
    await expect(page.locator('#mining-sig-one')).toContainText('암석 하나(× 1)는 언제나 후보');
    await expect(page.locator('.mining-sig-chart')).toContainText('굵은 선 = 입력한 값');
    await page.locator('#mining-sig-value').fill('4285');
    await expect(rows.filter({ hasText: '4,285 × 1' })).toContainText('알루미늄');
    // 4,285 × 3 은 흔한 암석의 무리 개수(4~6)에 없다: 주 결과가 아니라 참고 표에만 나온다.
    await page.locator('#mining-sig-value').fill('12855');
    await expect(page.locator('#mining-sig-result')).toContainText('무리 개수와 맞는 후보는 없습니다');
    await expect(rows).toHaveCount(0);
    await expect(page.locator('.mining-sig-table tbody tr', { hasText: '4,285 × 3' })).toHaveCount(1);
    await page.locator('#mining-sig-value').fill('7171');
    await expect(page.locator('#mining-sig-result')).toContainText('1~30개를 곱해서는 이 숫자가 나오지 않습니다');
});

test('정제소 찾기: UEX 보고가 없는 광물에서 넘어오면 앞서 고른 광물을 지우고 보고가 없다고 알린다', async ({ page }) => {
    await openMining(page, '#mining?m=Ore_Stileron&ores=59');
    await page.locator('#mining-refine-go').click();
    await expect(page.locator('#mining-view-ref')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#mining-ref-missing')).toContainText('UEX에 정제 수율 보고가 없는 광물입니다');
    await expect(page.locator('#mining-ref-missing')).toContainText('스틸레론');
    await expect(page.locator('[data-mining-ore][aria-pressed="true"]')).toHaveCount(0);
    await expect(page.locator('#mining-ref-best')).toContainText('광물을 고르면');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#mining?m=Ore_Stileron&tab=ref');
    // 다른 광물을 고르면 안내는 사라진다. 정제 보고에만 있는 상품도 한국어 이름으로 적는다.
    await expect(page.getByRole('button', { name: '자재 부스러기', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '금 (광석)', exact: true }).click();
    await expect(page.locator('#mining-ref-missing')).toHaveCount(0);
    await expect(page.locator('#mining-ref-best')).toContainText('ARC-L2');
});

test('정제소 찾기: 정제소 이름 목록만 못 받으면 번호 줄을 만들지 않고 알린 뒤 다시 받을 수 있다', async ({ page }) => {
    await mockApi(page, { fleet: true });
    let down = true;
    await page.route('**/api/uex/refineries*', (route) => route.fulfill({ json: { status: 'ok', data: refineryFixture(), meta: {} } }));
    await page.route('**/api/uex/terminals*', (route) => (down ? route.fulfill({ status: 503, json: { error: 'x' } }) : route.fulfill({ json: { status: 'ok', data: TERMINALS } })));
    await gotoSection(page, '#mining?tab=ref&ores=34');
    const table = page.locator('table[data-mining-csv="refineries"]');
    await expect(page.locator('#mining-ref-nonames')).toContainText('UEX 정제소 이름 목록을 받지 못했습니다');
    await expect(table.locator('tbody tr')).toHaveCount(31);
    await expect(table).not.toContainText('정제소 #');
    await expect(table).not.toContainText('게임 파일에만 있음');
    await expect(table.locator('tbody tr').first()).toContainText('UEX 확인 못 함');
    await expect(page.locator('#mining-ref-best')).toHaveCount(0);
    down = false;
    await page.locator('#mining-ref-retry').click();
    await expect(table.locator('tbody tr')).toHaveCount(32);
    await expect(page.locator('#mining-ref-nonames')).toHaveCount(0);
    await expect(page.locator('#mining-ref-best')).toContainText('ARC-L2');
});

test('장소 표: 동굴·시설 목록의 광물 수를 0으로 적지 않고, 알 수 없는 암석은 "게임 자료에 없음"으로 적는다', async ({ page }) => {
    await openMining(page, '#mining?tab=location&lay=table&sites=1');
    const row = (id) => page.locator('table[data-mining-csv="locations"] tbody tr', { has: page.locator(`[data-mining-location="${id}"]`) });
    await expect(row('Loot_Caves_Occupied_Rock_Pyro').locator('td').nth(4)).toHaveText('4');
    await expect(row('Loot_Caves_Occupied_Rock_Pyro').locator('td').nth(5)).toHaveText('4');
    await expect(row('ResourceRush_Gold').locator('td').nth(4)).toHaveText('게임 자료에 없음');
    await expect(row('ResourceRush_Gold').locator('td').nth(5)).toHaveText('게임 자료에 없음');
    // 광물 수가 0인 줄은 암석이 하나도 없는 목록뿐이다.
    const zero = await page.locator('table[data-mining-csv="locations"] tbody tr').evaluateAll((rows) => rows
        .filter((item) => item.cells[6].textContent.trim() === '0' && item.cells[5].textContent.trim() !== '0').map((item) => item.cells[0].textContent.trim()));
    expect(zero).toEqual([]);
    await row('ResourceRush_Gold').locator('[data-mining-location]').click();
    await expect(page.locator('.mining-detail')).toContainText('암석 종류: 게임 자료에 없음');
    await expect(page.locator('.mining-detail')).not.toContainText('암석 0종');
    // 동굴 목록에도 품질 값이 나온다.
    await row('Loot_Caves_Occupied_Rock_Pyro').locator('[data-mining-location]').click();
    await expect(page.locator('.mining-detail')).toContainText('품질 분포 (게임 파일 값)');
    await expect(page.locator('.mining-detail')).toContainText('손 채광 암석');
    await expect(page.locator('.mining-detail')).toContainText('내부 이름 FPS mineables');
});

test('장소 묶음: 행사·동굴·시설 목록 보기는 주소에 남고, 375px 에서 긴 이름이 잘리지 않는다', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await openMining(page, '#mining?tab=location');
    const before = await page.locator('.mining-place').count();
    await page.locator('#mining-sites-toggle').click();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#mining?sites=1&tab=location');
    const shown = await page.locator('.mining-place').count();
    expect(shown).toBeGreaterThan(before);
    await page.reload();
    await expect(page.locator('.mining-place')).toHaveCount(shown);
    expect(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth))).toBeLessThanOrEqual(375);
    const cut = await page.locator('.mining-place *').evaluateAll((nodes) => nodes.filter((node) => node.getBoundingClientRect().right > 375.5).length);
    expect(cut).toBe(0);
    // 모르는 성계 값은 버린다: 보이지 않는 조건이 목록을 비우지 않는다.
    await page.goto('/#mining?tab=location&sys=Foo');
    await page.reload();
    await expect(page.locator('.mining-place').first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#mining?tab=location');
});

test('장소 상세: 장소 전용 품질 값, 풀어 쓴 자리 이름, 같은 잔해 줄 묶기', async ({ page }) => {
    await openMining(page, '#mining?tab=location&loc=V3SlotPreset_Harvestable_RockCracker_Asteroid');
    const detail = page.locator('.mining-detail');
    await expect(detail).toContainText('QV 브레이커 스테이션 (Nyx) 전용 값');
    await expect(detail).toContainText('651');
    await expect(detail).toContainText('가운데 (사브릴륨)');
    expect((await detail.locator('.mining-detail-head .mining-muted').innerText()).trim()).toBe('시설');
    await page.goto('/#mining?tab=location&loc=AaronHalo');
    await expect(detail.locator('h3')).toContainText('아론 헤일로');
    const salvage = detail.locator('.mining-group', { hasText: '잔해 하나에서 나오는 자재 양은 게임 자료에 없습니다' });
    await expect(salvage).toContainText('× 9종');
    await expect(salvage.locator('thead').first()).toContainText('비중');
    await expect(salvage.locator('thead').first()).not.toContainText('스폰 확률');
    await page.goto('/#mining?tab=location&loc=Stanton1');
    await expect(detail).toContainText('사막');
    await expect(detail.locator('.mining-group', { hasText: '채집할 수 있는 식물' }).locator('thead')).not.toContainText('스폰 확률');
});

test('광물 목록: 최근 보고 가격에 나이를 적고, 가격 보고 기준을 바꿀 수 있다', async ({ page }) => {
    const market = [
        { t: 12, c: 33, sell: 30100, at: now() - 2 * 3600 },
        { t: 13, c: 33, sell: 99999, at: now() - 9 * DAY },
        { t: 14, c: 60, sell: 150000, at: now() - 9 * DAY },
    ];
    await page.setViewportSize({ width: 1440, height: 900 });
    await openMining(page, '#mining', { market });
    const gold = page.locator('.mining-list tbody tr', { has: page.locator('[data-mining-mineral="Ore_Gold"]') });
    await expect(page.locator('.mining-list thead .mining-recent')).toHaveText('최근 보고 최고 판매가 (3일 이내)');
    await expect(gold.locator('.mining-recent')).toBeVisible();
    await expect(gold.locator('.mining-recent')).toContainText('30,100');
    await expect(gold.locator('.mining-recent')).toContainText('2시간 전');
    // 표가 목록 칸보다 넓어지지 않는다 (시세가 옆으로 잘리지 않는다).
    expect(await page.locator('.mining-list .mining-tablewrap').evaluate((node) => node.scrollWidth <= node.clientWidth + 1)).toBe(true);
    const quant = page.locator('.mining-list tbody tr', { has: page.locator('[data-mining-mineral="Raw_Quantainium"]') });
    await expect(quant.locator('.mining-recent')).toHaveText('3일 이내 보고 없음');
    // UEX에 없는 광물은 "보고 없음".
    await expect(page.locator('.mining-list tbody tr', { has: page.locator('[data-mining-mineral="Hadanite"]') }).locator('td').nth(3)).toHaveText('보고 없음');
    await expect(page.locator('.mining-list tbody tr', { has: page.locator('[data-mining-mineral="Hadanite"]') }).locator('td').nth(2)).toHaveText('시세 정보 없음');
    await page.locator('#mining-age').focus();
    await page.locator('#mining-age').selectOption('15');
    await expect(page.locator('#mining-age')).toBeFocused();
    await expect(gold.locator('.mining-recent')).toContainText('99,999');
    await expect(gold.locator('.mining-recent')).toContainText('9일 전');
    await expect(quant.locator('.mining-recent')).toContainText('150,000');
    // 함께 쓰는 선택값에 남는다 (다른 화면과 같은 기준).
    expect(await page.evaluate(() => window.VOLT_TRADE_ENGINE.state.get().maxAgeDays)).toBe(15);
    await page.reload();
    await expect(page.locator('#mining-age')).toHaveValue('15');
    await expect(page.locator('.mining-list thead')).toContainText('(15일 이내)');
});

test('광물 목록: 시세를 못 받으면 이유와 다시 받기 단추가 나오고, 다시 받으면 시세가 채워진다', async ({ page }) => {
    await mockApi(page, { fleet: true });
    let status = 401;
    await page.route('**/api/uex/commodities*', (route) => (status ? route.fulfill({ status, json: { error: 'x' } }) : route.fulfill({ json: { status: 'ok', data: [{ id: 33, name: 'Gold', price_sell: 28870 }] } })));
    await page.route('**/api/uex/market*', (route) => route.fulfill({ json: { status: 'ok', data: [{ t: 12, c: 33, sell: 30100, at: now() - 3600 }] } }));
    await gotoSection(page, '#mining?m=Ore_Gold');
    const gold = page.locator('.mining-list tbody tr', { has: page.locator('[data-mining-mineral="Ore_Gold"]') });
    await expect(page.locator('#mining-price-error')).toContainText('로그인');
    await expect(gold.locator('td').nth(2)).toContainText('시세를 불러오지 못했습니다');
    await expect(gold.locator('.mining-recent')).toHaveText('최근 보고를 받지 못했습니다');
    // 상세의 최근 가격 칸은 못 받았을 때도 자리를 지킨다.
    await expect(page.locator('.mining-market')).toContainText('최근 보고를 받지 못했습니다');
    status = 403;
    await page.locator('#mining-price-retry').click();
    await expect(page.locator('#mining-price-error')).toContainText('커뮤니티 멤버');
    status = 0;
    await page.locator('#mining-price-retry').click();
    await expect(gold.locator('td').nth(2)).toContainText('28,870');
    await expect(gold.locator('.mining-recent')).toContainText('30,100');
    await expect(page.locator('#mining-price-error')).toHaveCount(0);
    await expect(page.locator('.mining-sources')).toContainText('시세: UEX 이용자 보고');
});

test('출처 줄과 탭 줄: 정제소 화면은 수율 보너스 출처를 적고, 화살표 키로 탭을 옮긴다', async ({ page }) => {
    await openMining(page, '#mining?tab=ref');
    await expect(page.locator('#mining-ref-best')).toBeVisible();
    const sources = page.locator('.mining-sources');
    await expect(sources).toContainText('정제 수율 보너스: UEX 이용자 보고');
    await expect(sources).not.toContainText('가격·재고');
    expect((await sources.innerText()).match(/\d+\.\d+\.\d+\.\d+/g)).toHaveLength(1);
    await page.locator('#mining-view-ref').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#mining-view-sig')).toBeFocused();
    await expect(page.locator('#mining-view-sig')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.mining-sources')).not.toContainText('UEX');
    await page.keyboard.press('Home');
    await expect(page.locator('#mining-view-mineral')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('#mining-view-ref')).toBeFocused();
    expect(await page.locator('.mining-tab[tabindex="0"]').count()).toBe(1);
});

test('정제소 찾기 375px: 옆으로 밀어도 정제소 이름이 남고, 성계·확인은 이름 아래에 적는다', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await openMining(page, '#mining?tab=ref');
    const table = page.locator('table[data-mining-csv="refineries"]');
    const head = table.locator('tbody tr', { hasText: 'ARC-L1' }).locator('th');
    await expect(head).toContainText('스탠턴 · 게임 파일 · UEX 모두');
    await expect(table.locator('thead th').nth(1)).toBeHidden();
    await page.locator('.mining-ref-full > summary').click();
    const wrap = page.locator('.mining-ref-full .mining-tablewrap').first();
    await wrap.evaluate((node) => { node.scrollLeft = 400; });
    const box = await head.boundingBox();
    const outer = await wrap.boundingBox();
    expect(Math.abs(box.x - outer.x)).toBeLessThan(3);
    // 수율 칸이 한 화면 안에 들어온다.
    const cell = await table.locator('tbody tr', { hasText: 'ARC-L1' }).locator('td.mining-bonus').first().boundingBox();
    expect(cell.x + cell.width).toBeLessThanOrEqual(375);
});
