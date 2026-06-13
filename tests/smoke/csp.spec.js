const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// CSP 가드레일.
// 강화 정책(script-src·style-src에서 'unsafe-inline' 제거)을 문서 응답에
// "강제(enforce)"로 주입해, 핵심 화면이 위반 없이 정상 동작하는지 검증한다.
// Stage A(script-src)와 Stage B(style-src) 전환의 회귀 감시 역할을 한다.
//
// localhost(http)에서는 upgrade-insecure-requests가 로컬 에셋 로드를 방해할 수 있어 제외.
const STRICT_CSP = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self' https://forms.gle",
    "img-src 'self' data: https:",
    "script-src 'self' https://static.cloudflareinsights.com",
    "style-src 'self'",
    "connect-src 'self' https://cloudflareinsights.com",
    "font-src 'self' data:",
    "object-src 'none'",
].join('; ');

// 문서(HTML) 응답에 강화 CSP를 강제로 주입한다. API/정적 요청은 그대로 통과시킨다.
async function enforceCsp(page) {
    await page.route('**/*', async (route) => {
        if (route.request().resourceType() !== 'document') return route.fallback();
        const response = await route.fetch();
        await route.fulfill({
            response,
            headers: { ...response.headers(), 'content-security-policy': STRICT_CSP },
        });
    });
}

// CSP 위반(securitypolicyviolation)과 관련 콘솔 에러를 수집한다.
async function trackCspViolations(page) {
    const violations = [];
    await page.addInitScript(() => {
        window.__cspViolations = [];
        document.addEventListener('securitypolicyviolation', (event) => {
            window.__cspViolations.push(`${event.violatedDirective} ← ${event.blockedURI || 'inline'}`);
        });
    });
    page.on('console', (message) => {
        const text = message.text();
        if (/content security policy|refused to (execute|load|apply)/i.test(text)) {
            violations.push(text);
        }
    });
    return {
        async collect() {
            const fromPage = await page.evaluate(() => window.__cspViolations || []);
            return [...violations, ...fromPage];
        },
    };
}

test.describe('CSP 가드레일(강화 script-src + style-src)', () => {
    test('홈: 강화 CSP에서 hero 렌더 + 위반 0', async ({ page }) => {
        await enforceCsp(page);
        await mockApi(page);
        const tracker = await trackCspViolations(page);

        await gotoSection(page, '');
        await expect(page.locator('#home .hero-content')).toBeVisible();
        await expect(page.locator('.nav-logo-text')).toHaveText('VOLT');

        expect(await tracker.collect()).toEqual([]);
    });

    // 동적 색상/그라데이션 인라인 스타일을 쓰던 섹션들. style-src 'self'에서
    // data 속성 + CSSOM 적용이 위반 없이 동작하는지 확인한다.
    for (const section of ['ships', 'notices', 'streamers', 'leadership', 'schedule']) {
        test(`섹션 ${section}: 강화 CSP에서 위반 0`, async ({ page }) => {
            await enforceCsp(page);
            await mockApi(page);
            const tracker = await trackCspViolations(page);

            await gotoSection(page, `#${section}`);
            await page.waitForTimeout(300);

            expect(await tracker.collect()).toEqual([]);
        });
    }

    test('관리자: 강화 CSP에서 대시보드 렌더 + 위반 0', async ({ page }) => {
        await enforceCsp(page);
        await mockApi(page);
        await page.route('**/api/admin/session', (route) => route.fulfill({ json: { authenticated: true } }));
        await page.route('**/api/admin/notices', (route) => route.fulfill({ json: { items: [] } }));
        const tracker = await trackCspViolations(page);

        await page.goto('/admin/');
        await expect(page.locator('#dashboard')).toBeVisible();

        expect(await tracker.collect()).toEqual([]);
    });
});
