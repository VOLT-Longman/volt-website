const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

test.describe('SEO 및 공유 메타데이터', () => {
    test('SPA 섹션과 언어 변경에 맞춰 문서 제목을 갱신한다', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect(page).toHaveTitle(/함선DB/);
        await page.locator('[data-set-lang="en"]').first().click();
        await expect(page).toHaveTitle(/Ship DB/);
    });

    test('SearchAction 쿼리가 검색 모달과 결과를 연다', async ({ page }) => {
        await mockApi(page);
        await page.goto('/?search=Cutlass');
        await page.waitForSelector('#loading-splash', { state: 'hidden' });
        await expect(page.locator('#search-overlay')).toHaveClass(/active/);
        await expect(page.locator('#global-search-input')).toHaveValue('Cutlass');
        await expect(page.locator('.search-result')).not.toHaveCount(0);
    });

    test('FAQPage JSON-LD와 다국어 공유 메타데이터를 제공한다', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#faq');
        const schema = await page.locator('#faq-schema').textContent();
        const faq = JSON.parse(schema);
        expect(faq['@type']).toBe('FAQPage');
        expect(faq.mainEntity.length).toBeGreaterThan(0);
        await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute('content', 'VOLT');
        await expect(page.locator('meta[property="og:locale:alternate"]')).toHaveAttribute('content', 'en_US');
    });

    test('정적 무역 가이드가 색인 가능한 메타데이터와 본문을 제공한다', async ({ page }) => {
        await page.goto('/guide/');
        await expect(page).toHaveTitle(/Star Citizen 무역 가이드/);
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://www.volt.ceo/guide/');
        await expect(page.locator('h1')).toContainText('스타시티즌 무역을 시작하는 법');
        await expect(page.locator('.static-guide-card')).toHaveCount(6);
    });
});
