// 브랜드 영상 시안을 파일로 뽑는다 (설치된 크롬 + Playwright, 추가 프로그램 없음).
//   node design/brand-film/render.cjs            → out/volt-brand-film.webm, .mp4(지원될 때), 장면 사진 6장
// 영상은 저장소에 넣지 않는다(out/ 은 .gitignore).
const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const dir = __dirname;
const out = path.join(dir, 'out');
fs.mkdirSync(out, { recursive: true });

(async () => {
    const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--autoplay-policy=no-user-gesture-required', '--window-size=1400,900'] });
    const mode = process.argv.includes('--background') ? 'background' : 'reel';
    const name = mode === 'background' ? 'volt-hero-background' : 'volt-brand-film';
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const logo = fs.readFileSync(path.join(dir, '../../assets/images/VOLT_logo.webp')).toString('base64');
    await page.addInitScript(`window.VOLT_LOGO_SRC = 'data:image/webp;base64,${logo}'; window.VOLT_FILM_MANUAL = true; window.VOLT_FILM_MODE = '${mode}';`);
    await page.goto(`file:///${path.join(dir, 'film.html').replace(/\\/g, '/')}`);
    await page.waitForFunction(() => window.VOLT_FILM);
    await page.waitForTimeout(800);

    // 장면 사진: 정해진 시각의 그림을 그대로 저장한다.
    for (const t of mode === 'background' ? [0, 2.5, 4.2, 9.999] : [1.6, 3.4, 4.7, 5.5, 6.9, 9.0]) {
        const data = await page.evaluate((time) => { window.VOLT_FILM.draw(time); return document.getElementById('film').toDataURL('image/jpeg', 0.9); }, t);
        fs.writeFileSync(path.join(out, `${mode === 'background' ? 'bg' : 'frame'}-${String(t).replace('.', '_')}s.jpg`), Buffer.from(data.split(',')[1], 'base64'));
    }

    const formats = [['webm', 'video/webm;codecs=vp9'], ['mp4', 'video/mp4;codecs=avc1.640028']];
    for (const [ext, type] of formats) {
        if (!(await page.evaluate((mime) => window.VOLT_FILM.supported(mime), type))) { console.log(`${ext}: 이 브라우저는 ${type} 녹화를 지원하지 않음`); continue; }
        const result = await page.evaluate(([mime, bits]) => window.VOLT_FILM.record(mime, bits), [type, mode === 'background' ? 2000000 : 9000000]);
        fs.writeFileSync(path.join(out, `${name}.${ext}`), Buffer.from(result.base64, 'base64'));
        console.log(`${ext}: ${result.frames} frames, ${(result.size / 1048576).toFixed(2)} MB`);
    }
    await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
