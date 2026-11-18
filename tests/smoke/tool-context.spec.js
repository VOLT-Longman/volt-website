const { test, expect } = require('@playwright/test');
const { AxeBuilder } = require('@axe-core/playwright');
const { readFile } = require('node:fs/promises');
const path = require('node:path');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

async function aiBackend(page, requests) {
    const { validateAiContext, toolReviewLoadout } = await import('../../functions/_shared/ai-loadout.js');
    const { validateJourneyContext, toolReviewJourney } = await import('../../functions/_shared/ai-journey.js');
    const env = { ASSETS: { fetch: async url => new Response(await readFile(path.join(__dirname, '../..', new URL(url).pathname))) } };
    await page.route('**/api/ai/chat', async route => {
        if (route.request().method() === 'GET') return route.fulfill({ json: { enabled: true, mode: 'data', memberOnly: true } });
        const body = route.request().postDataJSON(); requests.push(body);
        const result = body.context?.kind === 'journey' ? await toolReviewJourney(env, new Request(route.request().url()), validateJourneyContext(body.context), body.lang) : await toolReviewLoadout(env, validateAiContext(body.context), body.lang);
        return route.fulfill({ json: { ok: true, intent: 'loadout', ...result } });
    });
}
async function titan(page) {
    await gotoSection(page, '#loadout');
    await page.locator('#loadout-ship-search').fill('titan');
    await page.locator('[data-loadout-ship="aegs_avenger_titan"]').click();
}

for (const width of [1440, 390]) test(`${width}px 개별 실드 전원과 AI 검토·복귀는 같은 구성을 유지한다`, async ({ page }) => {
    const errors = trackConsoleErrors(page), requests = [];
    await page.setViewportSize({ width, height: 900 });
    await mockApi(page, { loggedIn: true }); await aiBackend(page, requests);
    await titan(page);
    const left = '.loadout-power-plan [data-loadout-power="hardpoint_shield_generator_left"]';
    await page.locator(left).click();
    await expect(page.locator('#loadout-power-shields')).toHaveValue('2');
    await expect(page.locator('.loadout-group.is-shield [data-loadout-power]').first()).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('.loadout-power-meter')).toHaveAttribute('value', '13');
    await page.locator('[data-loadout-ab="B"]').first().click();
    await page.locator(left).click();
    await expect(page.locator('#loadout-power-shields')).toHaveValue('4');
    await page.locator('[data-loadout-ab="A"]').first().click();
    await expect(page.locator(left)).toHaveAttribute('aria-pressed', 'false');
    await page.locator('[data-volt-context="loadout"]').click();
    await expect(page).toHaveURL(/#ai$/);
    await expect(page.locator('#volt-ai-context')).toContainText('구성 A');
    expect(requests).toHaveLength(0); // A handoff never submits on the user's behalf.
    await page.locator('#volt-ai-send').click();
    await expect(page.locator('.volt-ai-review')).toContainText('2개 중 1개 켜짐');
    await expect(page.locator('.volt-ai-review')).toContainText('구성 B');
    expect(requests[0].context.off.hardpoint_shield_generator_left).toBe(true);
    expect(requests[0].context.comparison.off.hardpoint_shield_generator_left).toBeUndefined();
    await expect(page.locator('.volt-ai-review-metrics')).toContainText('2,160');
    await expect(page.locator('.volt-ai-review-metrics')).toContainText('4,320');
    const audit = await new AxeBuilder({ page }).include('#volt-ai-context').include('.volt-ai-review').analyze();
    expect(audit.violations.filter(v => ['serious', 'critical'].includes(v.impact))).toEqual([]);
    await page.locator('.volt-ai-review').getByRole('button', { name: '로드아웃으로 돌아가기' }).click();
    await expect(page).toHaveURL(/#loadout$/);
    await expect(page.locator(left)).toHaveAttribute('aria-pressed', 'false');
    await page.reload();
    await expect(page.locator(left)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#loadout-power-shields')).toHaveValue('2');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(errors).toEqual([]);
});

test('함선 DB·로드아웃·플래너 연결은 선택 함선과 플래너 입력을 전달한다', async ({ page }) => {
    const requests = [];
    await mockApi(page, { loggedIn: true }); await aiBackend(page, requests);
    await titan(page);
    await page.locator('.loadout-identity [data-volt-open="ship"]').click();
    await expect(page.locator('#global-modal')).toContainText('어벤저 타이탄');
    await page.locator('#global-modal [data-volt-open="loadout"]').click();
    await expect(page).toHaveURL(/#loadout$/);
    await expect(page.locator('#loadout-ship-title')).toContainText('어벤저 타이탄');
    await page.locator('.loadout-identity [data-volt-open="planner"]').click();
    await expect(page.locator('#logistics-ship')).toHaveValue('avenger-titan');
    await page.locator('#logistics-cargo').fill('7');
    await page.locator('#logistics-ship-summary [data-volt-context="trade"]').click();
    await expect(page.locator('#volt-ai-context')).toContainText('입력 7 SCU');
    await page.locator('#volt-ai-send').click();
    await expect(page.locator('.volt-ai-review')).toContainText('플래너에 입력한 화물은 7 SCU');
    expect(requests[0].context).toMatchObject({ kind: 'journey', origin: 'trade', shipId: 'avenger-titan', cargoScu: 7, loadout: { ship: 'aegs_avenger_titan', slot: 'A' } });
    await page.locator('#volt-ai-context').getByRole('button', { name: '선택 해제' }).click();
    await expect(page.locator('#volt-ai-context')).toBeHidden();
});

test('전력이 부족한 실드 재시작은 다른 계통을 변경하지 않으며 실행 취소가 복원된다', async ({ page }) => {
    await mockApi(page); await titan(page);
    const left = page.locator('.loadout-power-plan [data-loadout-power="hardpoint_shield_generator_left"]');
    await left.click();
    await page.locator('#loadout-power-weapons').fill('4'); await page.locator('#loadout-power-weapons').press('Enter');
    await left.click();
    await expect(left).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#loadout-power-weapons')).toHaveValue('4');
    await expect(page.locator('.toast').last()).toContainText('2칸 더');
    await page.locator('[data-loadout-undo]').click();
    await expect(page.locator('#loadout-power-weapons')).toHaveValue('2');
    await left.click();
    await expect(left).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#loadout-power-shields')).toHaveValue('4');
});
