const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

// ShipDB 재작성 2단계 — crew 단독 원자 이관(D3).
// live 있는 함선은 모달이 이미 live.crewSize를 쓰므로, 레거시 수기 crew가 노출되는 곳은
// 비교표·리더보드·정렬이다. OFF=레거시(freelancer "1명"·caterpillar "5명"),
// ON=Erkul crewSize(둘 다 4). 수기값↔Erkul 불일치 제거.
async function openCompare(page, ids) {
    for (const id of ids) await page.locator(`[data-compare-ship-id="${id}"]`).click();
    await page.locator('#ship-compare-open').click();
    await page.waitForSelector('.ship-compare-table');
}
function crewRow(page) {
    return page.locator('.ship-compare-table tr', { hasText: '승무원' });
}

test.describe('crew 원자 이관 (OFF=레거시 수기, ON=Erkul crewSize)', () => {
    test('OFF 강제(되돌림): 비교표 승무원 = 레거시 수기값(1명·5명)', async ({ page }) => {
        const errors = trackConsoleErrors(page);
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = false; }); // 3.5-A 기본 ON → OFF 되돌림 검증
        await mockApi(page);
        await gotoSection(page, '#ships');
        await page.waitForSelector('.ship-card');
        await openCompare(page, ['freelancer', 'caterpillar']);
        const row = await crewRow(page).innerText();
        expect(row).toContain('1명');
        expect(row).toContain('5명');
        expect(errors).toEqual([]);
    });

    test('ON: 비교표 승무원 = Erkul crewSize(4), 레거시 수기값 제거', async ({ page }) => {
        await page.addInitScript(() => { window.__VOLT_SHIPDB_CANONICAL_TEST__ = true; });
        await mockApi(page);
        await gotoSection(page, '#ships');
        await expect.poll(async () => page.locator('#ships-grid [data-compare-ship-id]').count()).toBe(249);
        await openCompare(page, ['freelancer', 'caterpillar']);
        const row = await crewRow(page).innerText();
        expect(row).not.toContain('1명');
        expect(row).not.toContain('5명');
        expect(row).toContain('4');
    });
});
