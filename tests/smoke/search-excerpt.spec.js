const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

for (const width of [1280, 390]) {
    test(`긴 공지 검색은 세 줄 미리보기와 본문 뒤쪽 검색을 함께 지원한다 ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await mockApi(page, { loggedIn: false, community: true });
        const content = `${'긴 공지의 앞부분입니다.\n'.repeat(80)}끝부분검색어 <img src=x onerror=alert(1)> ${'마지막 설명입니다. '.repeat(30)}`;
        await page.route('**/api/notices', route => route.fulfill({ json: { items: [
            { id: 'long-notice', title: '긴 공지 검수', content, date: '2026-11-17', published: true },
        ] } }));
        await gotoSection(page, '#notices');
        await expect(page.locator('#notices-list')).toContainText('긴 공지 검수');
        const trigger = page.locator(width < 768 ? '#mobile-search-toggle' : '#search-toggle');
        if (width < 768) await page.locator('#hamburger').click();
        await trigger.click();
        const input = page.locator('#global-search-input');
        const result = page.locator('.search-result[data-search-section="notices"]');
        const summary = result.locator('.search-result-summary');
        for (const query of ['긴 공지 검수', '끝부분검색어']) {
            await input.fill(query);
            await expect(result).toHaveCount(1);
            if (query === '끝부분검색어') await expect(summary).toContainText(query);
            const metrics = await summary.evaluate(node => ({
                length: node.textContent.length,
                height: node.getBoundingClientRect().height,
                line: parseFloat(getComputedStyle(node).lineHeight),
            }));
            expect(metrics.length).toBeLessThanOrEqual(162);
            expect(metrics.height).toBeLessThanOrEqual(metrics.line * 3 + 1);
        }
        await expect(summary.locator('img')).toHaveCount(0);
        await expect(summary).toContainText('<img src=x onerror=alert(1)>');
        await page.keyboard.press('Escape');
        await expect(width < 768 ? page.locator('#hamburger') : trigger).toBeFocused();
        if (width < 768) await page.locator('#hamburger').click();
        await trigger.click();
        await input.fill('끝부분검색어');
        await result.click();
        await expect(page.locator('#search-overlay')).not.toHaveClass(/active/);
        await expect(page).toHaveURL(/#notices$/);
        await expect(page.locator('#global-modal [data-notice-reader-id="long-notice"]')).toBeVisible();
    });
}

for (const [width, lang, query] of [[360, 'ko', '함선 DB'], [768, 'ko', '함선 데이터베이스'], [1280, 'en', 'Ship DB']]) {
    test(`메뉴를 거치지 않고 함선 DB로 이동한다 ${width}px ${lang}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 844 });
        await mockApi(page);
        await gotoSection(page, `?lang=${lang}#home`);
        const trigger = page.locator(width <= 1200 ? '#header-search-toggle' : '#search-toggle');
        await trigger.click();
        const input = page.locator('#global-search-input');
        await expect(input).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(trigger).toBeFocused();
        await trigger.click();
        await input.fill(query);
        const top = page.locator('#search-results .search-result').first();
        await expect(top).toHaveAttribute('data-search-section', 'ships');
        await top.click();
        await expect(page).toHaveURL(/#ships$/);
        await expect(page.locator('#ships')).toBeVisible();
    });
}
