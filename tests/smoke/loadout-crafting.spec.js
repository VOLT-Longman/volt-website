const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection, trackConsoleErrors } = require('./helpers');

async function openAsgard(page) {
    await mockApi(page);
    await page.route('**/api/uex/**', (route) => route.fulfill({ json: { status: 'ok', data: [] } }));
    await gotoSection(page, '#loadout');
    await page.locator('#loadout-ship-search').fill('asgard');
    await page.locator('[data-loadout-ship="anvl_asgard"]').click();
    await expect(page.locator('#loadout-ship-title')).toHaveText('앤빌 아스가르드');
}

test('부품 상세의 제작 탭: 재료와 시간을 보여 주고 채광 안내의 그 광물로 넘어간다', async ({ page }) => {
    const errors = trackConsoleErrors(page);
    await openAsgard(page);
    const slot = page.locator('.loadout-slot:not(.is-parent)', { hasText: 'CF-337 판터 리피터' }).first();
    const componentId = await slot.locator('[data-loadout-detail]').first().getAttribute('data-loadout-detail');
    await slot.locator('[data-loadout-open]').first().click();
    await page.locator(`.loadout-picker [data-loadout-detail="${componentId}"]`).click();
    const detail = page.locator('.loadout-detail');
    await expect(detail).toBeVisible();
    const craftTab = detail.locator('[data-loadout-detail-tab="craft"]');
    await expect(craftTab).toBeVisible();
    await craftTab.click();
    await expect(craftTab).toHaveAttribute('aria-selected', 'true');
    await expect(detail.locator('.loadout-craft-list li').first()).toBeVisible();
    await expect(detail).toContainText('제작 시간');
    await expect(detail).toContainText('SCU');
    const material = (await detail.locator('.loadout-craft-list li span').first().innerText()).trim();
    await detail.locator('[data-loadout-mining]').first().click();
    await expect(page.locator('#mining')).toBeVisible();
    await expect(page.locator('.mining-detail h3')).toContainText('캐는 곳');
    await expect(page.locator('.mining-detail h3')).toContainText(material.slice(0, 2));
    await expect(page.locator('.mining-detail h3')).toBeFocused();
    await expect(page.locator('#loadout-app')).not.toHaveClass(/has-drawer/);
    expect(errors).toEqual([]);
});

test('다른 게임 빌드의 제작 자료는 현재 부품에 붙이지 않는다', async ({ page }) => {
    const crafting = require('../../data/loadout/crafting.json');
    await page.route('**/data/loadout/crafting.json*', (route) => route.fulfill({ json: { ...crafting, gameVersion: 'unverified-build' } }));
    await openAsgard(page);
    await page.locator('.loadout-slot:not(.is-parent)', { hasText: 'CF-337 판터 리피터' }).first().locator('[data-loadout-detail]').first().click();
    await expect(page.locator('[data-loadout-detail-tab="craft"]')).toHaveCount(0);
});

test('제작 자료를 받지 못해도 부품 상세는 그대로 열리고 제작 탭만 없다', async ({ page }) => {
    await page.route('**/data/loadout/crafting.json*', (route) => route.fulfill({ status: 500, body: 'x' }));
    await openAsgard(page);
    await page.locator('.loadout-slot:not(.is-parent)', { hasText: 'CF-337 판터 리피터' }).first().locator('[data-loadout-detail]').first().click();
    const detail = page.locator('.loadout-detail');
    await expect(detail.locator('[data-loadout-detail-tab="stats"]')).toBeVisible();
    await expect(detail.locator('[data-loadout-detail-tab="craft"]')).toHaveCount(0);
});
