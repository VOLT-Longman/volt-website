const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

async function openHauling(page) {
    await mockApi(page);
    await gotoSection(page, '#hauling');
    await expect(page.locator('#hauling-app .hauling-table')).toBeVisible();
}

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
    await page.locator('#hauling-by').selectOption({ index: 1 });
    await page.locator('#hauling-kind').selectOption('local');
    await page.locator('#hauling-rank').selectOption('6');
    await expect(page.locator('.hauling-table, .hauling-empty').first()).toBeVisible();
    await page.locator('.nav-lang [data-set-lang="en"]').click();
    await expect(page.locator('#hauling-ranks-title')).toHaveText('Hauling reputation ranks');
    await expect(page.locator('.hauling-sources')).toContainText('game files');
});

test('운송 계약: 자료를 받지 못하면 다시 시도할 수 있다', async ({ page }) => {
    await mockApi(page);
    let fail = true;
    await page.route('**/data/contracts/hauling.json*', (route) => (fail ? route.fulfill({ status: 500, body: 'x' }) : route.continue()));
    await gotoSection(page, '#hauling');
    await expect(page.locator('#hauling-app [role="alert"]')).toBeVisible();
    fail = false;
    await page.locator('[data-hauling-retry]').click();
    await expect(page.locator('.hauling-table')).toBeVisible();
});

for (const width of [1280, 390]) {
    test(`운송 계약: ${width}px 에서 넘치지 않고 접근성 위반이 없다`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await openHauling(page);
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const results = await new AxeBuilder({ page }).include('#hauling').analyze();
        expect(results.violations.filter((v) => ['critical', 'serious'].includes(v.impact)).map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    });
}
