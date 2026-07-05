const { test, expect } = require('@playwright/test');

// A-7: Admin 함선DB 탭의 Erkul Live 동기화 미리보기 (읽기 전용 — apply 버튼 없음).
// Functions가 없는 정적 dev 서버이므로 API는 전부 모킹한다.

const PREVIEW_RESPONSE = {
    source: 'erkul-live',
    generatedAt: '2026-07-05T13:00:00.000Z',
    summary: {
        erkulShips: 219, erkulShops: 112, matched: 210,
        statsChanged: 2, marketChanged: 1, descriptionsChanged: 0,
        newErkulCandidates: 9, unmatchedVolt: 30, marketOnlyUnmatched: 6,
        priceChanges: 1, purchaseLocationChanges: 0, rentalChanges: 0
    },
    changes: {
        stats: [
            { voltId: 'asgard', name: 'Asgard', field: 'cargoScu', current: 180, incoming: 200 },
            { voltId: 'asgard', name: 'Asgard', field: 'hp', current: 77000, incoming: 80000 }
        ],
        market: [
            { voltId: 'asgard', name: 'Asgard', type: 'price', shop: 'Astro Armada', location: 'Area18', current: 17860500, incoming: 18000000 }
        ],
        descriptions: [],
        newCandidates: [{ localName: 'anvl_lightning_f8', name: 'F8A Lightning', manufacturer: 'Anvil Aerospace' }],
        unmatched: [],
        marketOnly: [{ localName: 'rsi_aurora_mr' }]
    },
    warnings: []
};

async function mockAdmin(page, { previewStatus = 200, previewBody = PREVIEW_RESPONSE, delayMs = 0 } = {}) {
    await page.route('**/api/admin/session', (route) => route.fulfill({ json: { authenticated: true } }));
    await page.route('**/api/admin/notices', (route) => route.fulfill({ json: { items: [] } }));
    await page.route('**/api/admin/ships', (route) => route.fulfill({ json: { items: [] } }));
    await page.route('**/api/admin/ships/erkul-sync/preview', async (route) => {
        if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
        if (previewStatus !== 200) return route.fulfill({ status: previewStatus, json: { error: 'Erkul 데이터를 가져오지 못했습니다: Erkul이 요청을 차단함(403)' } });
        return route.fulfill({ json: previewBody });
    });
}

test.describe('Admin Erkul 동기화 미리보기', () => {
    test('함선DB 탭에서만 버튼 표시 + 적용 버튼 없음', async ({ page }) => {
        await mockAdmin(page);
        await page.goto('/admin/');
        await expect(page.locator('#dashboard')).toBeVisible();

        // 기본(공지) 탭에서는 숨김
        await expect(page.locator('#erkul-sync-card')).toBeHidden();
        await page.locator('[data-tab="ships"]').click();
        await expect(page.locator('#erkul-sync-card')).toBeVisible();
        await expect(page.locator('#erkul-sync-preview-button')).toHaveText('미리보기 실행');
        await expect(page.locator('#erkul-sync-card')).toContainText('실제 데이터는 변경되지 않습니다');
        // apply 버튼 금지 (A-7 범위)
        const applyButtons = page.locator('#erkul-sync-card button', { hasText: /적용|apply/i });
        await expect(applyButtons).toHaveCount(0);
        // 다른 탭으로 돌아가면 다시 숨김
        await page.locator('[data-tab="notices"]').click();
        await expect(page.locator('#erkul-sync-card')).toBeHidden();
    });

    test('클릭 → 로딩 표시 → summary 카드/변경 목록 표시', async ({ page }) => {
        await mockAdmin(page, { delayMs: 400 });
        await page.goto('/admin/');
        await page.locator('[data-tab="ships"]').click();

        await page.locator('#erkul-sync-preview-button').click();
        await expect(page.locator('#erkul-sync-preview-button')).toHaveText('불러오는 중…');
        await expect(page.locator('#erkul-sync-result')).toContainText('비교하는 중');

        const result = page.locator('#erkul-sync-result');
        await expect(result.locator('.sync-summary-item')).toHaveCount(5);
        await expect(result).toContainText('변경 항목');
        await expect(result).toContainText('신규 후보');
        await expect(result).toContainText('미매칭');
        await expect(result).toContainText('가격 변경');
        await expect(result).toContainText('구매처 변경');
        await expect(result).toContainText('cargoScu: 180 → 200');
        await expect(result).toContainText('Astro Armada @ Area18: 17860500 → 18000000');
        await expect(result).toContainText('F8A Lightning');
        await expect(result).toContainText('rsi_aurora_mr');
        await expect(page.locator('#erkul-sync-preview-button')).toHaveText('미리보기 실행');
    });

    test('실패(502) → 명확한 에러 표시 + 버튼 복구', async ({ page }) => {
        await mockAdmin(page, { previewStatus: 502 });
        await page.goto('/admin/');
        await page.locator('[data-tab="ships"]').click();

        await page.locator('#erkul-sync-preview-button').click();
        const error = page.locator('#erkul-sync-result .sync-error');
        await expect(error).toBeVisible();
        await expect(error).toContainText('미리보기 실패');
        await expect(error).toContainText('Erkul');
        await expect(page.locator('#erkul-sync-preview-button')).toBeEnabled();
    });
});
