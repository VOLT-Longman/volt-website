const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// P2-3C 성능 개선폭 계측: 함선DB/갤러리 지연이 초기 DOM/렌더 비용을 얼마나 줄이는지
// 같은 빌드에서 before(eager 등가) / after(lazy)를 산출한다.
//   after(lazy)      = 홈 로드 직후 노드 수(두 섹션 미렌더)
//   eager 등가       = after + 함선DB 진입 델타 + 갤러리 진입 델타
//   절감             = eager 등가 - after (= 두 섹션 델타 합)
// 수치는 콘솔로 출력하고, 지연이 유효한지(하한)만 안정적으로 단언한다.
test.describe('lazy init 개선폭 계측', () => {
    test('초기 DOM/렌더 비용 before-after', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '');

        const homeNodes = await page.evaluate(() => document.querySelectorAll('*').length);
        const homeShipCards = await page.locator('#ships-grid .ship-card').count();
        const homeGalleryChildren = await page.locator('#gallery-grid > *').count();

        // 함선DB 진입 → 렌더까지 걸린 시간(브라우저 내부 측정) + 추가 노드
        const shipStart = await page.evaluate(() => performance.now());
        await page.locator('.nav-links a[href="#ships"]').click();
        await page.locator('#ships-grid .ship-card').first().waitFor();
        const shipRenderMs = await page.evaluate((start) => performance.now() - start, shipStart);
        const afterShipsNodes = await page.evaluate(() => document.querySelectorAll('*').length);
        const shipCards = await page.locator('#ships-grid .ship-card').count();

        // 갤러리 진입 → 추가 노드
        await gotoSection(page, '#gallery');
        await page.locator('#gallery-grid > *').first().waitFor();
        const afterGalleryNodes = await page.evaluate(() => document.querySelectorAll('*').length);

        const shipsDelta = afterShipsNodes - homeNodes;
        const galleryDelta = afterGalleryNodes - afterShipsNodes;
        const eagerEquivalent = homeNodes + shipsDelta + galleryDelta;
        const savedNodes = shipsDelta + galleryDelta;
        const savedPct = ((savedNodes / eagerEquivalent) * 100).toFixed(1);

        // eslint-disable-next-line no-console
        console.log([
            '',
            '── P2-3 lazy init 개선폭 계측 ─────────────────────────',
            `홈 로드 DOM 노드 (after/lazy)   : ${homeNodes}`,
            `홈 함선 카드 / 갤러리 자식       : ${homeShipCards} / ${homeGalleryChildren}  (지연되어 0이어야 함)`,
            `함선DB 진입 추가 노드            : +${shipsDelta}  (카드 ${shipCards}장)`,
            `갤러리 진입 추가 노드            : +${galleryDelta}`,
            `eager 등가 홈 DOM 노드 (before)  : ${eagerEquivalent}`,
            `초기 절감 노드 / 비율            : -${savedNodes}  (${savedPct}%)`,
            `함선 그리드 렌더 소요(진입 시)   : ${shipRenderMs.toFixed(1)} ms  (초기 임계경로에서 제거됨)`,
            '───────────────────────────────────────────────────',
            '',
        ].join('\n'));

        // 안정적 하한: 지연이 실제로 동작하고 절감이 유의미한지.
        expect(homeShipCards).toBe(0);
        expect(homeGalleryChildren).toBe(0);
        expect(shipCards).toBeGreaterThan(200);
        expect(shipsDelta).toBeGreaterThan(500);
    });
});
