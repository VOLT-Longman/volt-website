const { test, expect } = require('@playwright/test');

test('gallery local previews render under production CSP and disappear when editing is canceled', async ({ page }) => {
  await page.route('**/admin/', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'" } });
  });
  await page.route('**/api/admin/session', route => route.fulfill({ json: { authenticated: true } }));
  await page.route('**/api/admin/notices{,?*}', route => route.fulfill({ json: { items: [] } }));
  await page.route('**/api/admin/gallery{,?*}', route => route.fulfill({ json: { items: [] } }));
  await page.goto('/admin/');
  await page.locator('[data-tab="gallery"]').click();
  const buffer = Buffer.from(await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    canvas.getContext('2d').fillRect(0, 0, 1280, 720);
    return canvas.toDataURL('image/png').split(',')[1];
  }), 'base64');
  await page.locator('#upload-file').setInputFiles({ name: 'preview.png', mimeType: 'image/png', buffer });
  const image = page.locator('#gallery-preview img');
  await expect(image).toHaveAttribute('src', /^data:image\/webp/);
  await expect.poll(() => image.evaluate(el => el.naturalWidth)).toBe(640);
  await expect.poll(() => image.evaluate(el => el.naturalHeight)).toBe(360);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#cancel-button').click();
  await expect(page.locator('#gallery-preview img')).toHaveCount(0);
  await expect(page.locator('#upload-file')).toHaveValue('');
});
