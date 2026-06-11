// 라이트 테마 시각 점검용 스크린샷 캡처 (QA 보조 스크립트, 배포 산출물 아님)
// 사용법: node scripts/capture-light-theme.mjs [출력디렉터리]
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const outDir = process.argv[2] || 'test-results/light-theme';
mkdirSync(outDir, { recursive: true });

const SECTIONS = ['home', 'about', 'timeline', 'leadership', 'hub', 'streamers', 'gallery', 'join',
    'notices', 'ships', 'trade-planner', 'schedule', 'policy', 'faq', 'guide', 'ai', 'mypage'];

const browser = await chromium.launch();
for (const [label, viewport] of [['mobile', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 900 }]]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    await context.addInitScript(() => localStorage.setItem('volt-theme', 'light'));
    await context.route('**/api/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }));
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:8787/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#loading-splash', { state: 'hidden', timeout: 10000 }).catch(() => {});
    // reveal 애니메이션을 강제로 완료시켜 전체 페이지 캡처에서 빈 영역을 없앤다.
    await page.addStyleTag({ content: '.reveal{opacity:1 !important;transform:none !important}' });
    for (const section of SECTIONS) {
        if (section !== 'home') {
            await page.evaluate((id) => { location.hash = id; }, section);
            await page.waitForTimeout(500);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({ path: `${outDir}/${label}-${section}.png` });
    }
    await context.close();
}
await browser.close();
console.log(`Saved screenshots to ${outDir}`);
