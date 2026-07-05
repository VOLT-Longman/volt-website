const { test, expect } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');
const { mockApi, gotoSection } = require('./helpers');

// 접근성 래칫(ratchet) 테스트.
// 핵심 화면에서 axe-core로 critical/serious 위반을 검사한다.
// 기존에 알려진 위반은 화면별 allowlist에 기록해 통과시키되,
// allowlist에 없는 "새" critical/serious 위반이 생기면 실패한다.
//
// allowlist는 갚아야 할 접근성 부채 목록이다. CSP/정리 단계에서
// 다음 항목들을 줄여 나가고, 해결되면 allowlist에서 제거한다.
//   - color-contrast: 라이트/다크 테마 대비 보정 필요
//   - heading-order: 섹션 제목 단계(h2→h3) 정리 필요 (moderate, 참고용)
//   - nested-interactive / aria-allowed-role: 함선 카드/모달 인터랙티브 중첩 구조 개선 필요
//   - aria-dialog-name: 전역 모달에 접근 가능한 이름(aria-labelledby) 부여 필요
const BLOCKING_IMPACTS = new Set(['critical', 'serious']);

async function assertNoNewViolations(page, allowlist) {
    const results = await new AxeBuilder({ page }).analyze();
    const blocking = results.violations.filter((v) => BLOCKING_IMPACTS.has(v.impact));
    const unexpected = blocking.filter((v) => !allowlist.includes(v.id));
    const summary = unexpected.map((v) => `(${v.impact}) ${v.id}: ${v.help}`);
    expect(summary, `새 접근성 위반:\n${summary.join('\n')}`).toEqual([]);
}

test.describe('접근성(axe) 래칫', () => {
    test('홈: 새 critical/serious 위반 없음', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '');
        await assertNoNewViolations(page, ['color-contrast']);
    });

    test('모바일 메뉴: 새 critical/serious 위반 없음', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await mockApi(page);
        await gotoSection(page, '');
        await page.locator('#hamburger').click();
        await expect(page.locator('#mobileMenu')).toBeVisible();
        await assertNoNewViolations(page, []);
    });

    test('함선 모달: 새 critical/serious 위반 없음', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        await page.locator('#ships-grid .ship-card').first().click();
        await expect(page.locator('#global-modal')).toHaveClass(/active/);
        // aria-dialog-name 부채 해소: 전역 모달에 aria-labelledby(제목) 부여(P3-2).
        await assertNoNewViolations(page, ['color-contrast', 'nested-interactive']);
        await expect(page.locator('#global-modal .modal-card')).toHaveAttribute('aria-labelledby', /.+/);
    });

    test('공지 모달: 새 critical/serious 위반 없음 + dialog 이름', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#notices');
        await page.locator('#notices-list .notice-card').first().click();
        await expect(page.locator('#global-modal')).toHaveClass(/active/);
        await expect(page.locator('#global-modal .modal-card')).toHaveAttribute('aria-labelledby', /.+/);
        await assertNoNewViolations(page, ['color-contrast', 'nested-interactive']);
    });

    test('전역 검색 오버레이: 새 critical/serious 위반 없음', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '');
        await page.locator('#search-toggle').click();
        await expect(page.locator('#search-overlay')).toHaveClass(/active/);
        await assertNoNewViolations(page, ['color-contrast']);
    });
});
