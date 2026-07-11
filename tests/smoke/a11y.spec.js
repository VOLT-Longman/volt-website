const { test, expect } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');
const { mockApi, gotoSection } = require('./helpers');

// 접근성 래칫(ratchet) 테스트.
// 핵심 화면에서 axe-core로 critical/serious 위반을 검사한다.
// 기존에 알려진 위반은 화면별 allowlist에 기록해 통과시키되,
// allowlist에 없는 "새" critical/serious 위반이 생기면 실패한다.
//
// allowlist는 갚아야 할 접근성 부채 목록이다. 해결되면 allowlist에서 제거해 래칫을 조인다.
// 2026-07-06 부채 상환 완료 — 현재 allowlist는 전부 비어 있다:
//   - color-contrast: 소형 흰 글자 + 브랜드 오렌지(3.88:1) 컴포넌트들을 --volt-orange-dark(5.39:1)로 교체
//   - nested-interactive: 함선 카드에서 role="button"/tabindex 제거, 함선명(.ship-name-btn)이 키보드 진입점
//   - aria-dialog-name: 전역 모달 aria-labelledby (P3-2에서 해소)
// 새 위반이 생기면 즉시 실패한다. allowlist에 다시 추가하지 말고 원인을 고친다.
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
        await assertNoNewViolations(page, []);
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
        await assertNoNewViolations(page, []);
        await expect(page.locator('#global-modal .modal-card')).toHaveAttribute('aria-labelledby', /.+/);
    });

    test('공지 모달: 새 critical/serious 위반 없음 + dialog 이름', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#notices');
        await page.locator('#notices-list .notice-card').first().click();
        await expect(page.locator('#global-modal')).toHaveClass(/active/);
        await expect(page.locator('#global-modal .modal-card')).toHaveAttribute('aria-labelledby', /.+/);
        // Modal fade-in temporarily blends foreground/background colors, which can
        // create false color-contrast failures before the final state settles.
        await page.waitForTimeout(400);
        await assertNoNewViolations(page, []);
    });

    test('전역 검색 오버레이: 새 critical/serious 위반 없음', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '');
        await page.locator('#search-toggle').click();
        await expect(page.locator('#search-overlay')).toHaveClass(/active/);
        // fadeIn(0.2s) 중에 axe가 스캔하면 opacity가 곱해진 색으로 대비를 오판한다 — 정착 대기
        await page.waitForTimeout(400);
        await assertNoNewViolations(page, []);
    });

    // C-5: 문서 구조(moderate) 래칫 — 상환 완료 상태를 고정한다.
    // h1은 sr-only 사이트 제목으로 상시 존재, 푸터는 h2 그룹, 렌더러 h4 단계 건너뜀 제거.
    for (const hash of ['', '#ships', '#schedule', '#join', '#trade-planner']) {
        test(`문서 구조: heading-order/h1 위반 없음 (${hash || 'home'})`, async ({ page }) => {
            await mockApi(page);
            await gotoSection(page, hash);
            const results = await new AxeBuilder({ page })
                .withRules(['heading-order', 'page-has-heading-one', 'empty-heading'])
                .analyze();
            const summary = results.violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')}`));
            expect(summary, `문서 구조 위반:\n${summary.join('\n')}`).toEqual([]);
        });
    }
});
