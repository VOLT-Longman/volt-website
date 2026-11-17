// 첫 화면 미리보기 사진을 찍는다 (이 가지의 사이트를 PC 안에서 띄움, 라이브와 무관).
//   node design/brand-film/preview.cjs <이름>      → out/preview-<이름>-desktop.jpg, -mobile.jpg
const { chromium } = require('@playwright/test');
const { spawn } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '../..');
const name = process.argv[2] || 'current';
// 미리보기 전용: 사이트 코드를 바꾸지 않고 화면에만 영상을 끼워 넣는다.
//   overlay: 사진을 어둡게 눌러 두고 그 위에 항로 영상을 빛으로 겹침 (함선 사진 유지)
//   replace: 사진 대신 영상만
const VARIANTS = {
    overlay: `
        #home .hero-cine-image { filter: brightness(.42) saturate(.75) contrast(1.12) !important; }
        #home .hero-cine .hero-film { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); mix-blend-mode: screen; opacity: .95; pointer-events: none; }
        #home .hero-cine::after { z-index: 2; }`,
    replace: `
        #home .hero-cine-media { visibility: hidden; }
        #home .hero-cine .hero-film { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); pointer-events: none; }
        #home .hero-cine::after { z-index: 2; background: linear-gradient(270deg,rgba(7,7,7,.8) 0%,rgba(7,7,7,.45) 34%,transparent 70%),linear-gradient(0deg,#070707 0%,transparent 22%) !important; }`,
};
const wait = Number(process.argv[3]) || 4200;
const port = 8793;

(async () => {
    const server = spawn(process.execPath, ['scripts/dev-server.js', '--port', String(port)], { cwd: root, stdio: 'ignore' });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--autoplay-policy=no-user-gesture-required'] });
    try {
        for (const [label, viewport] of [['desktop', { width: 1440, height: 900 }], ['mobile', { width: 390, height: 844 }]]) {
            const page = await browser.newPage({ viewport, deviceScaleFactor: label === 'mobile' ? 2 : 1, bypassCSP: true });
            const errors = [];
            page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text().slice(0, 160)); });
            await page.goto(`http://localhost:${port}/`);
            if (VARIANTS[name]) {
                await page.addStyleTag({ content: VARIANTS[name] });
                await page.evaluate(() => {
                    const video = document.createElement('video');
                    video.className = 'hero-film'; video.muted = true; video.loop = true; video.autoplay = true; video.playsInline = true;
                    video.src = '/design/brand-film/out/volt-hero-background.webm';
                    document.getElementById('hero-cine').append(video);
                    return video.play().catch(() => null);
                });
            }
            await page.waitForTimeout(wait);
            const video = await page.evaluate(() => { const v = document.querySelector('#home video'); return v ? { paused: v.paused, time: Number(v.currentTime.toFixed(2)), ready: v.readyState, src: v.currentSrc.split('/').pop() } : null; });
            await page.screenshot({ path: path.join(__dirname, 'out', `preview-${name}-${label}.jpg`), type: 'jpeg', quality: 86 });
            console.log(label, JSON.stringify(video), errors.length ? errors : 'no console errors');
            await page.close();
        }
    } finally { await browser.close(); server.kill(); }
})().catch((error) => { console.error(error); process.exit(1); });
