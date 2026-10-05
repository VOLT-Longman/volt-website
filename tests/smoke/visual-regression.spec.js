const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// C-4 스크린샷 회귀: 핵심 화면의 기준 이미지를 고정한다.
// 이것이 CSS cascade 중복(129건) 속성 단위 병합의 착수 조건이다 (BACKLOG 참조).
//
// 안정화 전략:
// - 애니메이션/전환 전면 비활성 + reveal 최종 상태 강제 (플레이크 1순위 원인 제거)
// - 웹폰트 로드 완료 대기 (document.fonts.ready)
// - 데이터는 mockApi로 고정 (discord-stats 1234 등), 동적 시간 요소 없음
// - 기준 이미지는 Windows/chromium에서 생성됨 — 다른 OS에서 재생성 시
//   `npx playwright test visual-regression --update-snapshots`
//
// 갱신 규칙: 의도한 시각 변경이면 위 명령으로 기준 이미지를 같은 커밋에서 갱신한다.
// 의도하지 않았는데 깨지면 그것이 이 테스트의 존재 이유다 — 원인을 고친다.

const FREEZE_CSS = `
    *, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
    }
    .reveal { opacity: 1 !important; transform: none !important; }
    html { scroll-behavior: auto !important; }
`;

async function stabilize(page) {
    await page.addStyleTag({ content: FREEZE_CSS });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => {
        const image = document.querySelector('.hero-cine-image');
        return !image || (image.complete && image.naturalWidth > 0);
    });
    await page.waitForTimeout(150);
}

const SCREENS = [
    { name: 'home', hash: '' },
    { name: 'ships', hash: '#ships' },
    { name: 'notices', hash: '#notices' },
    { name: 'schedule', hash: '#schedule' },
    { name: 'gallery', hash: '#gallery' },
    { name: 'leadership', hash: '#leadership' },
    { name: 'hub', hash: '#hub' },
    { name: 'guide', hash: '#guide' },
    { name: 'policy', hash: '#policy' },
    { name: 'trade-planner', hash: '#trade-planner' },
];

test.describe('스크린샷 회귀 (C-4)', () => {
    // 권위 기준은 CI(ubuntu)의 `-linux.png` — 갱신은 visual-baseline 워크플로(수동 dispatch)로만 (M0).
    // 로컬 win32 기준은 개발 참고용이며, 세션 간 서브픽셀 차이는 회귀로 취급하지 않는다 (WORK_STATUS 참조).

    for (const screen of SCREENS) {
        test(`데스크톱: ${screen.name}`, async ({ page }) => {
            await mockApi(page);
            if (screen.name === 'gallery') {
                await page.route('**/api/gallery', route => route.fulfill({ json: { items: [{ id: 'surface-gallery', title: 'VOLT 활동 사진', date: '2026-10-05', src: '/assets/images/landing/hero-01-m.webp' }] } }));
            }
            await gotoSection(page, screen.hash);
            if (screen.name === 'gallery') {
                await expect(page.locator('.gallery-item img')).toBeVisible();
                await expect.poll(() => page.locator('.gallery-item img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
            }
            await stabilize(page);
            await expect(page).toHaveScreenshot(`${screen.name}-desktop.png`, { maxDiffPixels: 120 });
        });
    }

    test('데스크톱: 함선 모달 (Asgard)', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ships');
        // live 레이어 로드 완료 후 모달 (설명/구매처 포함 상태 고정)
        await expect.poll(() => page.evaluate(() => Boolean(window.VOLT_SHIP_LIVE_STATS))).toBe(true);
        await page.locator('#ship-search').fill('Asgard');
        await page.locator('#ships-grid .ship-card .ship-name-btn').first().click();
        await expect(page.locator('#global-modal')).toHaveClass(/active/);
        await stabilize(page);
        await expect(page.locator('#global-modal .modal-card')).toHaveScreenshot('ship-modal-asgard.png', { maxDiffPixels: 120 });
    });

    test('데스크톱: 공지 읽기 화면', async ({ page }) => {
        await mockApi(page);
        await page.route('**/api/notices', route => route.fulfill({ json: { items: [{
            id: 'reader-visual', title: '함선DB 및 무역플래너 업데이트 안내', date: '2026-10-05', tag: '시스템',
            content: '■ 내용\n\n안녕하세요, VOLT 함대원 여러분.\n\n함선 정보와 무역 경로를 더 편리하게 확인할 수 있도록 홈페이지를 개선했습니다.\n\n⸻\n\n■ 주요 변경 사항\n\n최신 함선 제원과 구매처를 한눈에 확인하고, 무역플래너에서 거래 가능량을 비교해 보세요.\n\n⸻\n\n■ 사용 방법\n\n함선DB에서 원하는 함선을 선택하면 상세 정보를 볼 수 있습니다.'
        }] } }));
        await gotoSection(page, '#notices');
        await page.locator('[data-notice-id="reader-visual"]').click();
        await stabilize(page);
        await expect(page.locator('#global-modal .modal-card')).toHaveScreenshot('notice-reader.png', { maxDiffPixels: 120 });
    });

    test('모바일 390px: ships', async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await ctx.newPage();
        await mockApi(page);
        await gotoSection(page, '#ships');
        await stabilize(page);
        await expect(page).toHaveScreenshot('ships-mobile390.png', { maxDiffPixels: 120 });
        await ctx.close();
    });

    test('모바일 390px: home', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await mockApi(page);
        await gotoSection(page, '');
        await stabilize(page);
        await expect(page).toHaveScreenshot('home-mobile390.png', { maxDiffPixels: 120 });
    });
});
