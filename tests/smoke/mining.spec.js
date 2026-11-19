const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

async function openMining(page, prices = [{ name: 'Gold', price_sell: 28870 }, { name: 'Quantainium', price_sell: 148409 }, { name: 'Hadanite', price_sell: 2750 }]) {
    await mockApi(page, { fleet: true });
    await page.route('**/api/uex/commodities', (route) => route.fulfill({ json: { status: 'ok', data: prices } }));
    await gotoSection(page, '#mining');
    await expect(page.locator('#mining-app .mining-table').first()).toBeVisible();
}

test('채광 안내: 375px에서 가로 스크롤 없이 광물 아래 시세와 단위를 읽는다', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openMining(page);
    await page.locator('#mining-search').fill('gold');
    const price = page.locator('.mining-mobile-price').first();
    await expect(price).toBeVisible();
    await expect(price).toContainText('28,870');
    await expect(price).toContainText('aUEC/SCU');
    const bounds = await price.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(375);
    await page.route('**/api/uex/commodities', route => route.fulfill({ status: 503, json: { error: 'unavailable' } }));
    await page.reload();
    // 받지 못한 것과 "UEX에 없는 광물"을 같은 말로 적지 않는다.
    await expect(page.locator('.mining-mobile-price').first()).toContainText('시세를 불러오지 못했습니다');
    await expect(page.locator('.mining-mobile-price').first()).not.toContainText('시세 정보 없음');
    // 좁은 화면의 단위 글자도 12px 이상.
    expect(await page.locator('.mining-mobile-price').first().evaluate((node) => getComputedStyle(node).fontSize)).toBe('12px');
});

test('채광 안내: 광물을 고르면 캐는 곳이 나오고, 장소로 넘어가면 그곳의 광물이 나온다', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await openMining(page);
    await expect(page.locator('#mining h2')).toContainText('채광');
    // 시세가 있는 광물이 위로 온다.
    const first = page.locator('.mining-list tbody tr').first();
    await expect(first).toContainText('148,409');
    await page.locator('#mining-search').fill('gold');
    await page.locator('[data-mining-mineral="Ore_Gold"]').first().click();
    const detail = page.locator('.mining-detail');
    await expect(detail.locator('h3')).toContainText('캐는 곳');
    await expect(detail.locator('h3')).toBeFocused();
    await expect(detail).toContainText('28,870');
    expect(await detail.locator('tbody tr').count()).toBeGreaterThan(3);
    await expect(detail.getByRole('columnheader', { name: '스폰 확률' })).toBeVisible();
    await expect(detail.locator('thead')).not.toContainText('포함 확률');
    // 캐는 곳 목록에서 장소로 넘어간다.
    await detail.locator('[data-mining-location]').first().click();
    await expect(page.locator('.mining-tab.is-active')).toHaveText('장소별');
    await expect(page.locator('#mining-search')).toHaveValue('');
    await expect(page.locator('.mining-detail h3')).toContainText('나오는 광물');
    await expect(page.locator('.mining-detail .mining-parts li').first()).toBeVisible();
    await expect(detail.getByRole('columnheader', { name: '스폰 확률' }).first()).toBeVisible();
    await expect(detail.locator('.mining-parts li small').first()).toHaveText(/^[^%]+%$/);
    expect(errors).toEqual([]);
});

test('채광 안내: 검색과 방식 필터, 영어 전환', async ({ page }) => {
    await openMining(page);
    await page.locator('#mining-search').fill('하다');
    await expect(page.locator('.mining-list tbody tr')).toHaveCount(1);
    await expect(page.locator('#mining-search')).toBeFocused();
    await page.locator('#mining-search').fill('');
    await page.locator('[data-mining-mode="hand"]').click();
    for (const tag of await page.locator('.mining-list tbody tr td:nth-child(2)').allTextContents()) expect(tag).toContain('손 채광');
    await page.locator('#mining-search').fill('없는광물이름');
    await expect(page.locator('.mining-empty')).toBeVisible();
    await page.locator('#mining-search').fill('');
    await page.locator('.nav-lang [data-set-lang="en"]').click();
    await expect(page.locator('.mining-tab').first()).toHaveText('By mineral');
    await expect(page.locator('.mining-sources')).toContainText('game files');
});

test('채광 안내: 시세를 받지 못해도 광물과 장소는 그대로 보인다', async ({ page }) => {
    await mockApi(page, { fleet: true });
    await page.route('**/api/uex/commodities', (route) => route.fulfill({ status: 503, json: { error: 'down' } }));
    await gotoSection(page, '#mining');
    await expect(page.locator('.mining-list tbody tr').first()).toBeVisible();
    await expect(page.locator('.mining-sources')).toContainText('시세를 불러오지 못했습니다');
    await page.locator('[data-mining-view="location"]').click();
    await expect(page.locator('.mining-place').first()).toBeVisible();
});

test('채광 안내: 자료를 받지 못하면 다시 시도할 수 있다', async ({ page }) => {
    await mockApi(page, { fleet: true });
    let fail = true;
    await page.route('**/data/mining/helper.json*', (route) => (fail ? route.fulfill({ status: 500, body: 'x' }) : route.continue()));
    await gotoSection(page, '#mining');
    await expect(page.locator('#mining-app [role="alert"]')).toBeVisible();
    fail = false;
    await page.locator('[data-mining-retry]').click();
    await expect(page.locator('.mining-list tbody tr').first()).toBeVisible();
});

for (const width of [1280, 390]) {
    test(`채광 안내: ${width}px 에서 넘치지 않고 접근성 위반이 없다`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await openMining(page);
        await page.locator('[data-mining-mineral="Ore_Gold"]').first().click();
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const results = await new AxeBuilder({ page }).include('#mining').analyze();
        expect(results.violations.filter((v) => ['critical', 'serious'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
}

test('채광 안내: 새 보기 탭이 더해져도 기존 화면이 그대로이고, 출처와 게임 버전, 암석 신호 값을 보여 준다', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await openMining(page);
    await expect(page.locator('.mining-tab')).toHaveText(['광물별', '장소별', '신호값으로 찾기', '정제소 찾기']);
    await expect(page.locator('#mining-view-mineral')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.mining-chips [data-mining-mode]')).toHaveCount(4);
    await expect(page.locator('.mining-sources')).toContainText('게임 버전 4.');
    await expect(page.locator('.mining-sources')).toContainText('자료: 게임 파일');
    // 버전 번호는 하나만 적는다.
    expect((await page.locator('.mining-sources').innerText()).match(/\d+\.\d+\.\d+\.\d+/g)).toHaveLength(1);
    await page.locator('#mining-search').fill('gold');
    await page.locator('[data-mining-mineral="Ore_Gold"]').first().click();
    await expect(page.locator('.mining-detail thead')).toContainText('신호 값 (1개)');
    await expect(page.locator('.mining-detail tbody')).toContainText('3,585');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#mining?m=Ore_Gold&q=gold');
    // 장소별에서는 채집·잔해 수거 칩이 더해지고, 광물별로 돌아오면 그 선택은 풀린다.
    await page.locator('[data-mining-view="location"]').click();
    await expect(page.locator('.mining-chips [data-mining-mode]')).toHaveCount(6);
    await page.locator('[data-mining-mode="salvage"]').click();
    await page.locator('[data-mining-view="mineral"]').click();
    await expect(page.locator('[data-mining-mode=""]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.mining-list tbody tr').first()).toBeVisible();
    expect(errors).toEqual([]);
});
