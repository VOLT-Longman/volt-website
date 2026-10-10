const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// VOLT Comms 섹션의 라우팅/메뉴 노출 회귀 가드.
// (VALID_SECTIONS 등록 누락, 더보기/모바일/footer 링크 누락을 잡는다.)
test.describe('VOLT Comms', () => {
    test('딥링크: /#comms 직접 진입 시 섹션 활성 + 더보기 강조', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#comms');

        await expect(page.locator('#comms')).toHaveClass(/active/);
        await expect(page.locator('#home')).toBeHidden();
        await expect(page.locator('#nav-more-toggle')).toHaveClass(/nav-active/);
    });

    test('데스크톱 더보기: VOLT Comms 클릭 시 섹션 전환', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '');

        await page.locator('#nav-more-toggle').click();
        await page.locator('#nav-more-menu a[href="#comms"]').click();
        await expect(page.locator('#comms')).toHaveClass(/active/);
    });

    test('모바일 메뉴: VOLT Comms 노출 + 클릭 시 닫힘 + 섹션 전환', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await mockApi(page);
        await gotoSection(page, '');

        await page.locator('#hamburger').click();
        await expect(page.locator('#mobileMenu')).toHaveClass(/active/);
        const commsLink = page.locator('#mobileMenu a[href="#comms"]');
        await expect(commsLink).toBeVisible();

        await commsLink.click();
        await expect(page.locator('#mobileMenu')).not.toHaveClass(/active/);
        await expect(page.locator('#comms')).toHaveClass(/active/);
    });

    test('footer: VOLT Comms 링크로 섹션 전환', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '');

        await page.locator('.footer a[href="#comms"]').click();
        await expect(page.locator('#comms')).toHaveClass(/active/);
    });

    test('다운로드 CTA: GitHub Releases 최신 + 안전한 외부 링크 속성', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#comms');

        const download = page.locator('#comms a[href="https://github.com/VOLT-Longman/volt-comms/releases/latest"]').first();
        await expect(download).toHaveAttribute('target', '_blank');
        await expect(download).toHaveAttribute('rel', /noopener/);
        await expect(download).toHaveAttribute('rel', /noreferrer/);
    });

    test('사용 안내 앵커는 새로고침에도 유지되고 영어·모바일에서도 읽을 수 있다', async ({ page }) => {
        await mockApi(page);
        await page.setViewportSize({ width: 390, height: 844 });
        await gotoSection(page, '#comms');
        await page.getByRole('link', { name: '사용 방법', exact: true }).click();
        await expect(page).toHaveURL(/#comms-usage$/);
        await expect(page.locator('#comms')).toHaveClass(/active/);
        await page.reload();
        await expect(page.locator('#comms')).toHaveClass(/active/);
        await page.evaluate(() => window.VOLT_I18N.setLang('en'));
        await expect(page.locator('#comms-usage')).toContainText('How to use');
        await expect(page.locator('#comms')).toContainText('Get connection help on Discord');
        expect(await page.locator('#comms').innerText()).not.toMatch(/[가-힣]/);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        const { AxeBuilder } = require('@axe-core/playwright');
        const result = await new AxeBuilder({ page }).include('#comms').analyze();
        expect(result.violations.filter((v) => ['critical', 'serious'].includes(v.impact))).toEqual([]);
    });
});
