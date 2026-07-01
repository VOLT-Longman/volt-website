const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// 공지/임원진 레이아웃 최적화 회귀 가드: 요약 표시 + 상세는 모달, 모바일 overflow 없음.
test.describe('공지/임원진 레이아웃', () => {
    test('공지: 피드 카드 + excerpt + 상세 보기 모달', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#notices');

        const cards = page.locator('#notices-list .notice-card');
        await expect(cards.first()).toBeVisible();
        await expect(cards.first().locator('.notice-excerpt')).toBeVisible();

        await cards.first().click();
        const modal = page.locator('#global-modal');
        await expect(modal).toHaveClass(/active/);
        await expect(modal.locator('.modal-title')).not.toHaveText('');

        await page.keyboard.press('Escape');
        await expect(modal).not.toHaveClass(/active/);
    });

    test('임원진: 요약 카드(상세 숨김) + 상세 보기 모달(상세 노출)', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#leadership');

        const cards = page.locator('#leadership-grid .leader-card');
        await expect(cards.first()).toBeVisible();
        await expect(page.locator('#leadership-grid .leader-card.is-primary')).toHaveCount(1);
        const name = (await cards.first().locator('h3').innerText()).trim();
        // 카드에는 장문 상세(리더십 철학)를 숨긴다.
        await expect(cards.first()).not.toContainText('리더십 철학');

        await cards.first().click();
        const modal = page.locator('#global-modal');
        await expect(modal).toHaveClass(/active/);
        await expect(modal.locator('.modal-title')).toHaveText(name);
        // 상세는 모달에서 노출된다.
        await expect(modal).toContainText('리더십 철학');

        await page.keyboard.press('Escape');
        await expect(modal).not.toHaveClass(/active/);
    });

    test('모바일 390px: 공지/임원진 카드 overflow 없음', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await mockApi(page);

        for (const [hash, sel] of [['#notices', '#notices-list .notice-card'], ['#leadership', '#leadership-grid .leader-card']]) {
            await gotoSection(page, hash);
            const cards = page.locator(sel);
            await expect(cards.first()).toBeVisible();
            const count = Math.min(await cards.count(), 6);
            for (let i = 0; i < count; i += 1) {
                const overflow = await cards.nth(i).evaluate((el) => el.scrollWidth - el.clientWidth);
                expect(overflow).toBeLessThanOrEqual(1);
            }
        }
    });
});
