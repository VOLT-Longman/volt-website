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
    warnings: [],
    previewHash: 'abc123def4567890abc123def4567890abc123def4567890abc123def4567890',
    apply: {
        method: 'local-script',
        command: 'npm run shipdb:erkul:apply -- --confirm-preview-hash abc123def4567890abc123def4567890abc123def4567890abc123def4567890',
        note: '정적 파일 레이어는 운영 API에서 쓰지 않는다.'
    }
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

// E-1 상태 패널용: 데이터 레이어 정적 파일을 결정적 내용으로 모킹한다.
async function mockLayerFiles(page, {
    statsSyncedAt = '2026-06-01T00:00:00.000Z',
    marketSyncedAt = '2026-06-01T00:00:00.000Z',
    failStats = false
} = {}) {
    await page.route('**/data/ship-live-stats.js', (route) => {
        if (failStats) return route.fulfill({ status: 500, body: 'error' });
        return route.fulfill({
            contentType: 'application/javascript',
            body: `window.VOLT_SHIP_LIVE_STATS = {"a":{"source":"erkul-live","syncedAt":"${statsSyncedAt}","erkulLocalName":"x"},"b":{"source":"erkul-live","syncedAt":"${statsSyncedAt}","erkulLocalName":"y"}};`
        });
    });
    // a = 실제 가격 충돌(warn 대상), b = 렌탈가 미제공 기록(price=0: — info 대상)
    await page.route('**/data/ship-market.js', (route) => route.fulfill({
        contentType: 'application/javascript',
        body: `window.VOLT_SHIP_MARKET = {"a":{"syncedAt":"${marketSyncedAt}","purchase":[],"anomalies":["mapped purchase 충돌로 미병합: New Deal@Lorville"]},"b":{"syncedAt":"${marketSyncedAt}","purchase":[],"anomalies":["price=0: Vantage Rentals@Lorville"]}};`
    }));
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

    test('Safe Apply 안내: hash 표시 + 명령 복사 버튼 + 바로 적용 없음 (A-8)', async ({ page, context }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await mockAdmin(page);
        await page.goto('/admin/');
        await page.locator('[data-tab="ships"]').click();
        await page.locator('#erkul-sync-preview-button').click();

        const guide = page.locator('.sync-apply-guide');
        await expect(guide).toBeVisible();
        await expect(guide).toContainText('Safe Apply는 로컬 스크립트로 실행됩니다');
        await expect(guide).toContainText('현재 previewHash');
        await expect(guide.locator('.sync-command')).toContainText('npm run shipdb:erkul:apply -- --confirm-preview-hash');
        // 바로 적용 버튼 금지 — 복사 버튼만 존재
        await expect(guide.locator('button')).toHaveCount(1);
        await expect(guide.locator('button')).toHaveText('적용 명령 복사');
        await expect(page.locator('#erkul-sync-card button', { hasText: /바로 적용|즉시 적용|apply now/i })).toHaveCount(0);

        await guide.locator('.sync-copy-button').click();
        await expect(guide.locator('.sync-copy-button')).toHaveText('복사됨');
        const clipboard = await page.evaluate(() => navigator.clipboard.readText());
        expect(clipboard).toContain('npm run shipdb:erkul:apply -- --confirm-preview-hash abc123def');
    });

    test('E-1 상태 패널: 탭 진입 시 syncedAt·척수·anomaly·주기 초과 배지 표시', async ({ page }) => {
        await mockAdmin(page);
        await mockLayerFiles(page); // 2026-06-01 동기화 → 격주(14일) 초과 상태
        await page.goto('/admin/');
        await page.locator('[data-tab="ships"]').click();

        const status = page.locator('#erkul-sync-status');
        await expect(status).toContainText('마지막 동기화');
        await expect(status).toContainText('2026'); // KST 표기 날짜
        await expect(status.locator('.sync-badge-info').filter({ hasText: '레이어' })).toHaveText('레이어 2척');
        // anomaly 세분화: 실제 가격 충돌은 warn, 렌탈가 미제공(price=0:)은 info로 구분
        await expect(status.locator('.sync-badge-warn').filter({ hasText: '가격 충돌' })).toContainText('가격 충돌 anomaly 1척');
        await expect(status.locator('.sync-badge-info').filter({ hasText: '렌탈가' })).toContainText('렌탈가 미제공 기록 1척');
        await expect(status.locator('.sync-badge-warn').filter({ hasText: '격주' })).toContainText('격주 주기 초과');
        // stats/market 동기화 시점이 같으면 불일치 배지 없음
        await expect(status.locator('.sync-badge-danger')).toHaveCount(0);
    });

    test('E-1 상태 패널: 렌탈가 미제공만 있으면 충돌 배지는 ok', async ({ page }) => {
        await mockAdmin(page);
        await mockLayerFiles(page);
        // 충돌 없이 렌탈 기록만 있는 레이어로 덮어쓴다 (나중 등록 우선)
        await page.route('**/data/ship-market.js', (route) => route.fulfill({
            contentType: 'application/javascript',
            body: 'window.VOLT_SHIP_MARKET = {"a":{"syncedAt":"2026-06-01T00:00:00.000Z","purchase":[],"anomalies":["price=0: Traveler Rentals@Orison"]},"b":{"syncedAt":"2026-06-01T00:00:00.000Z","purchase":[],"anomalies":[]}};'
        }));
        await page.goto('/admin/');
        await page.locator('[data-tab="ships"]').click();

        const status = page.locator('#erkul-sync-status');
        await expect(status.locator('.sync-badge-ok')).toContainText('가격 충돌 없음');
        await expect(status.locator('.sync-badge-info').filter({ hasText: '렌탈가' })).toContainText('렌탈가 미제공 기록 1척');
    });

    test('E-1 상태 패널: stats/market 시점 불일치 → danger 배지', async ({ page }) => {
        await mockAdmin(page);
        await mockLayerFiles(page, { marketSyncedAt: '2026-06-15T00:00:00.000Z' });
        await page.goto('/admin/');
        await page.locator('[data-tab="ships"]').click();
        await expect(page.locator('#erkul-sync-status .sync-badge-danger')).toContainText('불일치');
    });

    test('E-1 상태 패널: 레이어 로드 실패 → 에러 표시하되 preview는 정상 동작', async ({ page }) => {
        await mockAdmin(page);
        await mockLayerFiles(page, { failStats: true });
        await page.goto('/admin/');
        await page.locator('[data-tab="ships"]').click();
        await expect(page.locator('#erkul-sync-status .sync-error')).toContainText('레이어 상태 확인 실패');
        // 상태 패널 실패가 preview 기능을 막지 않는다
        await page.locator('#erkul-sync-preview-button').click();
        await expect(page.locator('#erkul-sync-result')).toContainText('신규 후보');
    });

    test('E-1 preview 배지: 변경 있음 → 스펙/시장/신규 후보 구분 표시', async ({ page }) => {
        await mockAdmin(page);
        await mockLayerFiles(page);
        await page.goto('/admin/');
        await page.locator('[data-tab="ships"]').click();
        await page.locator('#erkul-sync-preview-button').click();

        const badges = page.locator('#erkul-sync-result .sync-badges');
        await expect(badges).toContainText('스펙 변경 2척');
        await expect(badges).toContainText('시장 변경 1척');
        await expect(badges).toContainText('신규 후보 9척');
        await expect(badges).not.toContainText('변경 없음');
    });

    test('E-1 preview 배지: 변경 없음 → "적용 불필요" 단일 판단 배지', async ({ page }) => {
        const noChange = {
            ...PREVIEW_RESPONSE,
            summary: {
                ...PREVIEW_RESPONSE.summary,
                statsChanged: 0, marketChanged: 0, descriptionsChanged: 0,
                newErkulCandidates: 0, priceChanges: 0, purchaseLocationChanges: 0
            },
            changes: { ...PREVIEW_RESPONSE.changes, stats: [], market: [], descriptions: [], newCandidates: [], marketOnly: [] }
        };
        await mockAdmin(page, { previewBody: noChange });
        await mockLayerFiles(page);
        await page.goto('/admin/');
        await page.locator('[data-tab="ships"]').click();
        await page.locator('#erkul-sync-preview-button').click();

        const badges = page.locator('#erkul-sync-result .sync-badges');
        await expect(badges.locator('.sync-badge-ok')).toContainText('변경 없음 — 적용 불필요');
        await expect(badges.locator('.sync-badge-warn')).toHaveCount(0);
        await expect(page.locator('#erkul-sync-result')).toContainText('현재 데이터 레이어와 Erkul live가 일치합니다');
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
