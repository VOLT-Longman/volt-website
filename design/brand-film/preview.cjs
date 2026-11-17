// 첫 화면 사진을 찍는다 (이 가지의 사이트를 PC 안에서 띄움, 라이브와 무관).
//   node design/brand-film/preview.cjs [이름]   → out/site-<이름>-desktop.jpg, -mobile.jpg
// 영상은 사이트 코드(js/hero-film.js)가 직접 켠다. 여기서는 끼워 넣지 않는다.
const { chromium } = require('@playwright/test');
const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const name = process.argv[2] || 'film';
const wait = Number(process.argv[3]) || 6000;
const port = 8793;

(async () => {
    const server = spawn(process.execPath, ['scripts/dev-server.js', '--port', String(port)], { cwd: root, stdio: 'ignore' });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const browser = await chromium.launch({ channel: 'chrome', headless: false });
    try {
        for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
            const page = await browser.newPage({ viewport, deviceScaleFactor: label === 'mobile' ? 2 : 1 });
            const errors = [];
            page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 160)); });
            await page.goto(`http://localhost:${port}/`);
            await page.waitForTimeout(wait);
            const state = await page.evaluate(() => {
                const v = document.getElementById('hero-film');
                return { on: document.getElementById('home').classList.contains('hero-film-on'), paused: v.paused, time: Number(v.currentTime.toFixed(2)), src: v.currentSrc.split('/').pop() };
            });
            await page.screenshot({ path: path.join(__dirname, 'out', `site-${name}-${label}.jpg`), type: 'jpeg', quality: 86 });
            console.log(label, JSON.stringify(state), errors.length ? errors : 'no console errors');
            await page.close();
        }
    } finally { await browser.close(); server.kill(); }
})().catch((error) => { console.error(error); process.exit(1); });
