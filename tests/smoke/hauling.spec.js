const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

async function openHauling(page) {
    await mockApi(page, { fleet: true });
    await gotoSection(page, '#hauling');
    await expect(page.locator('#hauling-app .hauling-table')).toBeVisible();
}

test('운송 계약: 확인된 화물을 먼저 보여 주고 숨긴 계약 수와 지역 상세를 제공한다', async ({ page }) => {
    await openHauling(page);
    await expect(page.locator('.hauling-count')).toHaveText('36건 · 화물 내역 미확인 254건 숨김');
    const first = page.locator('.hauling-table tbody tr').first();
    await expect(first.locator('.hauling-cargo')).toContainText('6 SCU');
    await expect(first).toContainText('1 SCU 상자');
    await expect(first).toContainText('+100');
    await expect(page.locator('.hauling-table')).not.toContainText('자료에 화물 내역 없음');
    await expect(page.locator('.hauling-table')).not.toContainText(/Region[A-D]|PyroAndNyx/);
    await first.locator('.hauling-places summary').click();
    await expect(first.locator('.hauling-places')).toContainText('닉스');
    await expect(first.locator('.hauling-places')).toContainText('계약 발급 가능 지역');
    await page.locator('#hauling-missing').check();
    await expect(page.locator('.hauling-count')).toHaveText('290건 · 화물 내역 미확인 254건 포함');
    await expect(page.locator('.hauling-table tbody tr').first().locator('.hauling-cargo')).toBeVisible();
    await page.locator('[data-hauling-more]').click();
    await expect(page.locator('.hauling-table')).toContainText('자료에 화물 내역 없음');
    await page.locator('#hauling-kind').selectOption('recover');
    await page.locator('#hauling-missing').uncheck();
    await expect(page.locator('.hauling-empty')).toBeVisible();
    await expect(page.locator('.hauling-count')).toContainText('51건 숨김');
    await page.locator('#hauling-missing').check();
    await expect(page.locator('.hauling-table')).toBeVisible();
});

test('운송 계약: 미확인 지역 코드 여러 개를 한 번만 표시한다', async ({ page }) => {
    await mockApi(page, { fleet: true });
    const fixture = { version: 'test', ranks: [{ name: { ko: '교육생' }, min: 0 }], contractors: { a: { ko: '의뢰처' } }, resources: { gold: { ko: '금' } }, localities: { RegionA: { en: 'RegionA' }, RegionB: { en: 'RegionB' } }, contracts: [{ by: 'a', kind: 'local', min: 0, max: 0, places: ['RegionA', 'RegionB'], cargo: [{ resource: 'gold', min: 1, max: 1 }] }] };
    await page.route('**/data/contracts/hauling.json*', route => route.fulfill({ json: fixture }));
    await gotoSection(page, '#hauling');
    const region = page.locator('.hauling-table tbody tr').first().locator('td').nth(1);
    await expect(region).toHaveText('지역 미확인');
});

test('운송 계약: 등급을 고르면 그 등급에서 받을 수 있는 계약만 남는다', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await openHauling(page);
    await expect(page.locator('#hauling h2')).toContainText('운송');
    await expect(page.locator('.hauling-rank')).toHaveCount(7);
    await expect(page.locator('.hauling-rank').first()).toContainText('교육생');
    const total = await page.locator('.hauling-count').innerText();
    await page.locator('.hauling-rank').first().click();
    await expect(page.locator('.hauling-rank').first()).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.hauling-rank').first()).toBeFocused();
    await expect(page.locator('.hauling-count')).not.toHaveText(total);
    await expect(page.locator('#hauling-rank')).toHaveValue('0');
    // 같은 등급을 다시 누르면 풀린다.
    await page.locator('.hauling-rank').first().click();
    await expect(page.locator('.hauling-count')).toHaveText(total);
    expect(errors).toEqual([]);
});

test('운송 계약: 의뢰처·종류 필터, 더 보기, 영어 전환', async ({ page }) => {
    await openHauling(page);
    await page.locator('#hauling-kind').selectOption('interstellar');
    await expect(page.locator('#hauling-kind')).toBeFocused();
    for (const cell of await page.locator('.hauling-table tbody td:nth-child(2)').allTextContents()) expect(cell).toContain('성계 간');
    await page.locator('#hauling-kind').selectOption('');
    const before = await page.locator('.hauling-table tbody tr').count();
    await page.locator('[data-hauling-more]').click();
    expect(await page.locator('.hauling-table tbody tr').count()).toBeGreaterThan(before);
    await expect(page.locator('.hauling-table tbody tr').nth(before).locator('th')).toBeFocused();
    await page.locator('#hauling-by').selectOption({ index: 1 });
    await page.locator('#hauling-kind').selectOption('local');
    await page.locator('#hauling-rank').selectOption('6');
    await expect(page.locator('.hauling-table, .hauling-empty').first()).toBeVisible();
    await page.locator('.nav-lang [data-set-lang="en"]').click();
    await expect(page.locator('#hauling-ranks-title')).toHaveText('Hauling reputation ranks');
    await expect(page.locator('.hauling-sources')).toContainText('game files');
});

test('운송 계약: 자료를 받지 못하면 다시 시도할 수 있다', async ({ page }) => {
    await mockApi(page, { fleet: true });
    let fail = true;
    await page.route('**/data/contracts/hauling.json*', (route) => (fail ? route.fulfill({ status: 500, body: 'x' }) : route.continue()));
    await gotoSection(page, '#hauling');
    await expect(page.locator('#hauling-app [role="alert"]')).toBeVisible();
    fail = false;
    await page.locator('[data-hauling-retry]').click();
    await expect(page.locator('.hauling-table')).toBeVisible();
});

for (const width of [1280, 375]) {
    test(`운송 계약: ${width}px 에서 넘치지 않고 접근성 위반이 없다`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await openHauling(page);
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        for (const selector of ['.hauling-ranks', '.hauling-filters', '.hauling-tablewrap']) {
            const bounds = await page.locator(selector).boundingBox();
            expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        }
        if (width < 640) {
            const first = await page.locator('.hauling-table tbody tr').first().boundingBox();
            expect(first.y).toBeLessThan(750);
            const ranks = await page.locator('.hauling-ladder').boundingBox();
            expect(ranks.height).toBeLessThan(110);
            await page.locator('[data-hauling-rank="6"]').click();
            await expect(page.locator('#hauling-rank')).toHaveValue('6');
        }
        const results = await new AxeBuilder({ page }).include('#hauling').analyze();
        expect(results.violations.filter((v) => ['critical', 'serious'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
}
