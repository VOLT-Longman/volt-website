const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// D-1 회귀 가드: js/main.js가 로드하는 모듈 스크립트 중 "임의 1개"가 실패해도
// (캐시 skew·네트워크·보안 규칙) 전체 사이트가 백지화되지 않아야 한다.
// 과거 사고(landing.js)와 동일한 실패 클래스가 navigation.js 등 다른 9개 모듈에도
// 구조적으로 있었음을 전수 감사로 확인 → window.VOLT_X?.method?.() 옵셔널 체이닝으로
// 전체 호출부를 방어(docs/MILESTONE_D.md D-1). landing.js 자체는 landing-resilience.spec.js에서
// 이미 개별 검증하므로 여기서는 나머지 스크립트를 커버한다.
const OTHER_MODULES = [
    'navigation.js',
    'notices.js',
    'schedule.js',
    'uex.js',
    'uex-panel.js',
    'trade-planner.js',
    'ships.js',
    'search-modal.js',
    'auth-ui.js',
    'mypage.js',
];

test.describe('모듈 로드 회복탄력성 (D-1)', () => {
    for (const moduleFile of OTHER_MODULES) {
        test(`${moduleFile} 차단 시에도 스플래시 제거 + 홈 콘텐츠 렌더 + 콘솔 에러 없음`, async ({ page }) => {
            const errors = [];
            page.on('pageerror', (e) => errors.push(String(e)));
            await mockApi(page);
            await page.route(`**/js/${moduleFile}*`, (route) => route.abort());
            await gotoSection(page, '');

            await expect(page.locator('#loading-splash')).toBeHidden({ timeout: 5000 });
            await expect(page.locator('#home')).toBeVisible();
            await expect(page.locator('.nav-links').first()).toBeVisible();

            expect(errors, `${moduleFile} 실패 시 치명적 에러 발생:\n${errors.join('\n')}`).toEqual([]);
        });
    }
});
