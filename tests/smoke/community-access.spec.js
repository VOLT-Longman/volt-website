const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { mockApi, gotoSection, TEST_USER } = require('./helpers');

for (const section of ['ships', 'trade-planner', 'loadout']) {
    test(`Guest: ${section} is locked before any protected data request`, async ({ page }) => {
        await mockApi(page, { loggedIn: false });
        const requests = [];
        page.on('request', (req) => { if (/\/(?:data\/(?:loadout|canonical|ship-live-stats|ship-market)|api\/uex)/.test(req.url())) requests.push(req.url()); });
        await gotoSection(page, `#${section}`);
        const gate = page.locator(`#${section} .community-gate`);
        await expect(gate).toBeVisible();
        await expect(gate).toContainText('커뮤니티 멤버');
        await expect(page.locator(`#${section} [data-community-content]`)).toBeHidden();
        await expect(gate.locator('a[href^="/auth/discord/login"]')).toHaveAttribute('href', `/auth/discord/login?returnTo=${encodeURIComponent(`/#${section}`)}`);
        expect(requests).toEqual([]);
    });
}

test('An unrelated role does not unlock the tools; role assignment opens the current tool without reloading', async ({ page }) => {
    await mockApi(page, { loggedIn: true, community: false, roles: ['대표이사'] });
    await gotoSection(page, '#loadout');
    const gate = page.locator('#loadout .community-gate');
    await expect(gate).toContainText('역할이 확인되지 않았습니다');
    await expect(page.locator('#loadout-ship-search')).toHaveCount(0);
    await page.route('**/auth/me?refresh=1', (route) => route.fulfill({ json: {
        logged_in: true, user: TEST_USER, features: { communityTools: true, communityConfigured: true }
    } }));
    await gate.getByRole('button', { name: '권한 다시 확인' }).click();
    await expect(gate).toBeHidden();
    await expect(page.locator('#loadout-ship-search')).toBeVisible();
});

test('Revocation closes an already open ship detail and relocks the tools on resume', async ({ page }) => {
    await mockApi(page);
    await gotoSection(page, '#ships');
    await page.locator('#ship-search').fill('asgard');
    await page.locator('#ships-grid [data-ship-id]').first().click();
    await expect(page.locator('#global-modal')).toHaveClass(/active/);
    await page.route(/\/auth\/me(?:\?.*)?$/, (route) => route.fulfill({ json: {
        logged_in: true, user: TEST_USER, features: { communityTools: false, communityConfigured: true }
    } }));
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
    await expect(page.locator('#ships .community-gate')).toBeVisible();
    await expect(page.locator('#ships [data-community-content]')).toBeHidden();
    await expect(page.locator('#global-modal')).not.toHaveClass(/active/);
});

test('Auth failure and missing role configuration both keep content locked with a usable retry', async ({ page }) => {
    await mockApi(page, { loggedIn: true, community: false, configured: false });
    await gotoSection(page, '#trade-planner');
    const gate = page.locator('#trade-planner .community-gate');
    await expect(gate).toContainText('역할 연결을 준비 중');
    await page.route('**/auth/me?refresh=1', (route) => route.fulfill({ status: 503, json: {} }));
    await gate.getByRole('button', { name: '권한 다시 확인' }).click();
    await expect(gate).toContainText('권한을 확인하지 못했습니다');
    await expect(page.locator('#trade-planner [data-community-content]')).toBeHidden();
    await expect(gate.getByRole('button', { name: '권한 다시 확인' })).toBeEnabled();
});

test('Mobile English access gate fits the viewport and passes accessibility checks', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await mockApi(page, { loggedIn: false });
    await gotoSection(page, '#loadout');
    const gate = page.locator('#loadout .community-gate');
    await expect(gate).toContainText('Community members only');
    await expect(gate).toContainText('Check access again');
    expect(await gate.innerText()).not.toMatch(/[가-힣]/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const result = await new AxeBuilder({ page }).include('#loadout').analyze();
    expect(result.violations).toEqual([]);
    await context.close();
});
