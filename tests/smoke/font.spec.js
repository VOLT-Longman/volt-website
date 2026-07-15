const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

test.describe('VOLT Orbit Display', () => {
    test('브랜드 표면(지표·헤드라인·라벨)에 전용 웹폰트 적용 (I-1 확대 계약)', async ({ page }) => {
        // I-1(PM 지시)에서 적용 범위가 "지표 전용" → "브랜드 순간 전반"으로 확대됐다.
        // 이전 세션의 '미완성 폰트 격리' 결정은 v3(신규 생성기)로 대체 — 클리핑 우려는
        // landing.spec의 h1 overflow 검증이 계약으로 흡수한다.
        // 본문(한글)은 여전히 시스템 스택 — Orbit은 라틴 전용이라 자동 폴백된다.
        await mockApi(page);
        await gotoSection(page, '');
        const fontState = await page.locator('#home.hero .hero-proof dd').first().evaluate(async (element) => {
            await document.fonts.ready;
            return {
                family: getComputedStyle(element).fontFamily,
                loaded: document.fonts.check('700 48px "VOLT Orbit Display"', 'MOVE THE VERSE.'),
            };
        });
        expect(fontState.family).toContain('VOLT Orbit Display');
        expect(fontState.loaded).toBe(true);
        await expect(page.locator('#home.hero h1')).toHaveCSS('font-family', /VOLT Orbit Display/);
        await expect(page.locator('.nav-logo-text')).toHaveCSS('font-family', /VOLT Orbit Display/);
        await expect(page.locator('.landing-card-eyebrow').first()).toHaveCSS('font-family', /VOLT Orbit Display/);
        // 한글 본문은 전용 서체 대상이 아니다
        await expect(page.locator('.hero .subtitle')).not.toHaveCSS('font-family', /^"VOLT Orbit Display"$/);
    });

    test('전용 웹폰트 파일은 WOFF2로 제공된다', async ({ page }) => {
        const response = await page.request.get('/assets/fonts/VOLT-Orbit-Display.woff2');
        expect(response.ok()).toBe(true);
        expect(response.headers()['content-type']).toContain('font/woff2');
    });
});
