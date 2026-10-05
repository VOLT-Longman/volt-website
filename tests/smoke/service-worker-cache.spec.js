const { test, expect } = require('@playwright/test');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const sw = fs.readFileSync(path.join(__dirname, '../../sw.js'), 'utf8');

test('Real service worker shares offline notice shells and preserves unrelated caches', async ({ page }) => {
    // Stop a dedicated fixture server to make the worker's network truly unavailable.
    // Browser offline emulation alone does not cover worker requests on every platform.
    const server = http.createServer((request, response) => {
        const script = request.url === '/sw.js';
        response.writeHead(200, { 'Content-Type': script ? 'application/javascript' : 'text/html', 'Cache-Control': 'no-store' });
        response.end(script ? sw : '<!doctype html><html><body>VOLT public shell</body></html>');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const stop = async () => {
        if (!server.listening) return;
        const stopped = new Promise((resolve) => server.close(resolve));
        server.closeAllConnections();
        await stopped;
    };
    try {
        await page.goto(`http://127.0.0.1:${server.address().port}/404.html`);
        await page.evaluate(async () => {
            await caches.open('unrelated-app-cache');
            await caches.open('volt-cache-obsolete');
            await navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' });
            await navigator.serviceWorker.ready;
            if (!navigator.serviceWorker.controller) await new Promise((resolve) => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
        });
        await expect.poll(() => page.evaluate(() => caches.keys())).not.toContain('volt-cache-obsolete');
        expect(await page.evaluate(() => caches.keys())).toContain('unrelated-app-cache');
        for (const id of ['first', 'second']) {
            expect(await page.evaluate(async (notice) => (await fetch('/?notice=' + notice, { headers: { accept: 'text/html' } })).status, id)).toBe(200);
        }
        await expect.poll(() => page.evaluate(async () => {
            const name = (await caches.keys()).find((key) => key.startsWith('volt-cache-'));
            return (await (await caches.open(name)).keys()).map((key) => key.url).filter((url) => url.includes('?notice='));
        })).toEqual([]);
        await stop();
        const offline = await page.evaluate(async () => {
            const response = await fetch('/?notice=never-visited', { headers: { accept: 'text/html' } });
            return { status: response.status, html: await response.text() };
        });
        expect(offline.status).toBe(200);
        expect(offline.html).toContain('VOLT public shell');
        expect(await page.evaluate(async () => (await fetch('/guide/', { headers: { accept: 'text/html' } })).status)).toBe(503);
    } finally {
        await stop();
    }
});
