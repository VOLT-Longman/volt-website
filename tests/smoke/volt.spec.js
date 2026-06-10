const { test, expect } = require('@playwright/test');

async function expectNoConsoleErrors(page, action) {
    const errors = [];
    page.on('console', message => {
        if (message.type() === 'error') errors.push(message.text());
    });
    await action();
    expect(errors).toEqual([]);
}

test('home renders hero without console errors', async ({ page }) => {
    await expectNoConsoleErrors(page, async () => {
        await page.goto('/');
        await expect(page.locator('.hero h1')).toContainText('VOLT');
    });
});

test('primary navigation reaches core sections', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[data-section="ships"]').first().click();
    await expect(page.locator('#ships')).toBeInViewport();
    await page.locator('#nav-trade-toggle').click();
    await page.locator('#nav-trade-menu a[data-section="trade-planner"]').click();
    await expect(page.locator('#trade-planner')).toBeInViewport();
    await page.locator('a[data-section="notices"]').first().click();
    await expect(page.locator('#notices')).toBeInViewport();
});

test('ship search opens and closes a detail modal', async ({ page }) => {
    await page.goto('/#ships');
    const search = page.locator('#ship-search');
    await expect(search).toBeVisible();
    await search.fill('Taurus');
    await page.locator('.ship-card').first().click();
    await expect(page.locator('.modal.show, .modal[aria-hidden="false"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('.modal.show, .modal[aria-hidden="false"]')).toHaveCount(0);
});

test('trade planner allows cargo ship selection', async ({ page }) => {
    await page.goto('/#trade-planner');
    const input = page.locator('#logistics-ship-search');
    await expect(input).toBeVisible();
    await input.fill('Freelancer');
    await page.locator('#planner-ship-results button').first().click();
    await expect(page.locator('#selected-ship-summary')).toContainText(/Freelancer/i);
});

test('notices and gallery fallback content renders', async ({ page }) => {
    await page.goto('/#notices');
    await expect(page.locator('#notice-list, #notices')).toBeVisible();
    await page.goto('/#gallery');
    await expect(page.locator('#gallery-grid, #gallery')).toBeVisible();
});

test('member gated area shows login call to action when logged out', async ({ page }) => {
    await page.goto('/#mypage');
    await expect(page.locator('body')).toContainText(/Discord|???/);
});

test('theme toggle switches document theme', async ({ page }) => {
    await page.goto('/');
    const before = await page.locator('html').getAttribute('data-theme');
    await page.locator('#theme-toggle').click();
    const after = await page.locator('html').getAttribute('data-theme');
    expect(after).not.toBe(before);
});

test('VOLT AI is clearly marked as preparing', async ({ page }) => {
    await page.goto('/#ai');
    await expect(page.locator('#ai')).toContainText('?? ?');
    await expect(page.locator('#volt-ai-input')).toBeDisabled();
    await expect(page.locator('#volt-ai-send')).toBeDisabled();
});
