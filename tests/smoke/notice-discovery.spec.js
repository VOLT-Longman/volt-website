const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');
const notices = Array.from({ length: 7 }, (_, index) => ({
    id: `discovery-${index}`, title: `무역 브리핑 ${index}`, content: index === 6 ? '희귀 화물 운송 안내' : '정기 작전 안내',
    titleEn: `Trade briefing ${index}`, contentEn: index === 6 ? 'Rare cargo transport' : 'Regular operation',
    tag: index === 6 ? '모집' : '작전', tagEn: index === 6 ? 'Recruitment' : 'Operation',
    pinned: index === 0, published: true, date: `2026-09-${20 + index}`,
}));

async function setup(page) {
    await mockApi(page);
    await page.route('**/api/notices', (route) => route.fulfill({ json: { items: notices } }));
    await gotoSection(page, '#notices');
}

test('search finds content beyond the first page and combines with category filters', async ({ page }) => {
    await setup(page);
    await expect(page.locator('#notices-list .notice-card')).toHaveCount(4);
    await page.locator('#notice-search').fill('희귀 화물');
    await expect(page.locator('#notices-list .notice-card')).toHaveCount(1);
    await expect(page.locator('#notices-list')).toContainText('무역 브리핑 6');
    await page.locator('#notice-filters [data-tag="작전"]').click();
    await expect(page.locator('.notice-empty')).toBeVisible();
    await expect(page.locator('#notice-load-more')).toBeHidden();
    await page.locator('#notice-reset').click();
    await expect(page.locator('#notice-search')).toHaveValue('');
    await expect(page.locator('#notice-search')).toBeFocused();
    await expect(page.locator('#notices-list .notice-card')).toHaveCount(4);
});

test('pinned toggle and reset expose the correct pressed states', async ({ page }) => {
    await setup(page);
    await page.locator('#notice-pinned-toggle').click();
    await expect(page.locator('#notice-pinned-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#notices-list .notice-card')).toHaveCount(1);
    await expect(page.locator('#notices-list')).toContainText('무역 브리핑 0');
    await page.locator('#notice-reset').click();
    await expect(page.locator('#notice-pinned-toggle')).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#notice-filters [data-tag="all"]')).toHaveAttribute('aria-pressed', 'true');
});

test('pagination count resets when changing a search', async ({ page }) => {
    await setup(page);
    await expect(page.locator('#notice-results')).toHaveText('4 / 7개 공지');
    await page.locator('#notice-load-more').click();
    await expect(page.locator('#notices-list .notice-card')).toHaveCount(7);
    await expect(page.locator('#notice-results')).toHaveText('7 / 7개 공지');
    await page.locator('#notice-search').fill('정기');
    await expect(page.locator('#notice-results')).toHaveText('4 / 6개 공지');
});

test('bilingual search and filters survive language switching', async ({ page }) => {
    await setup(page);
    await page.locator('#notice-search').fill('RARE cargo');
    await expect(page.locator('#notices-list')).toContainText('무역 브리핑 6');
    await page.locator('.nav-lang [data-set-lang="en"]').click();
    await expect(page.locator('#notice-search')).toHaveAttribute('placeholder', 'Search titles or content');
    await expect(page.locator('#notices-list')).toContainText('Trade briefing 6');
    await expect(page.locator('#notice-results')).toHaveText('1 of 1 notices');
    await page.locator('#notice-filters [data-tag="모집"]').click();
    await expect(page.locator('#notice-filters [data-tag="모집"]')).toContainText('Recruitment');
    await expect(page.locator('#notices-list .notice-card')).toHaveCount(1);
});

test('mobile search, empty feedback and filters remain within the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await setup(page);
    await page.locator('#notice-search').fill('<missing>');
    await expect(page.locator('.notice-empty')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.locator('#notice-reset').click();
    await expect(page.locator('#notices-list .notice-card')).toHaveCount(4);
});
