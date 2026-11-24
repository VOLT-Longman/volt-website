const { expect } = require('@playwright/test');

async function typeKorean(page, selector) {
    const field = page.locator(selector);
    await field.focus();
    const initial = await field.elementHandle();
    const cdp = await page.context().newCDPSession(page);
    try {
        for (const [partial, syllable] of [['ㅌ', '타'], ['ㅇ', '이']]) {
            for (const text of [partial, syllable]) {
                await cdp.send('Input.imeSetComposition', { text, selectionStart: 1, selectionEnd: 1 });
                expect(await initial.evaluate((el) => el === document.activeElement && el.isConnected)).toBe(true);
            }
            await cdp.send('Input.insertText', { text: syllable });
            expect(await initial.evaluate((el) => el === document.activeElement && el.isConnected)).toBe(true);
        }
        await expect(field).toHaveValue('타이');
    } finally { await cdp.detach(); }
}

module.exports = { typeKorean };
