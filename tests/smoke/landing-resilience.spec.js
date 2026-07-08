const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// 회귀 가드: 랜딩 강화 레이어(js/landing.js)가 로드 실패해도(캐시 skew·네트워크·보안 규칙)
// 핵심 사이트가 죽지 않아야 한다. 과거: VOLT_LANDING 미정의 → main.js init throw →
// 로딩 스플래시가 화면을 덮어 "아무것도 안 뜨는" 백지 증상.
test.describe('랜딩 회복탄력성 (landing.js 로드 실패)', () => {
    test('landing.js 차단 시에도 스플래시 제거 + 콘텐츠 렌더 + 콘솔 에러 없음', async ({ page }) => {
        const errors = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        await mockApi(page);
        await page.route('**/js/landing.js*', (route) => route.abort());
        await gotoSection(page, '');

        // 스플래시가 걷히고(display:none) 히어로/내비가 보인다.
        await expect(page.locator('#loading-splash')).toBeHidden({ timeout: 5000 });
        await expect(page.locator('#home')).toBeVisible();
        await expect(page.locator('.nav-links').first()).toBeVisible();

        // 섹션 전환도 정상 동작(핵심 앱 살아있음).
        await gotoSection(page, '#ships');
        await expect(page.locator('#ships-grid .ship-card').first()).toBeVisible();

        expect(errors, `landing.js 실패 시 치명적 에러 발생:\n${errors.join('\n')}`).toEqual([]);
    });
});
