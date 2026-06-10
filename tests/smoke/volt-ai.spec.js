const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

test.describe('VOLT AI', () => {
    test('준비 중 상태 표시 + 입력 비활성', async ({ page }) => {
        await mockApi(page);
        await gotoSection(page, '#ai');

        await expect(page.locator('#ai')).toHaveClass(/active/);
        await expect(page.locator('.volt-ai-status-badge')).toContainText('준비 중');

        await expect(page.locator('#volt-ai-input')).toBeDisabled();
        await expect(page.locator('#volt-ai-send')).toBeDisabled();
        await expect(page.locator('#volt-ai-image-button')).toBeDisabled();
        await expect(page.locator('#volt-ai-voice-button')).toBeDisabled();
        await expect(page.locator('#volt-ai-new-chat')).toBeDisabled();
        await expect(page.locator('#volt-ai-history-button')).toBeDisabled();
        await expect(page.locator('#volt-ai-settings-button')).toBeDisabled();

        // 안내 카드 1장만 노출
        await expect(page.locator('#volt-ai-messages .volt-ai-message')).toHaveCount(1);
        await expect(page.locator('#volt-ai-messages')).toContainText('준비');
    });
});
