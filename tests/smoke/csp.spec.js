const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
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

// 배포 정책 파일(_headers)을 직접 검증한다. 실제 enforce 정책의 회귀(누군가
// unsafe-inline을 되돌리는 것)를 소스 오브 트루스 수준에서 막는다.
function readHeadersCsp() {
    const raw = fs.readFileSync(path.join(__dirname, '../../_headers'), 'utf8');
    const line = raw.split(/\r?\n/).map((l) => l.trim()).find((l) => l.startsWith('Content-Security-Policy'));
    return line || '';
}

function directive(csp, name) {
    const body = csp.replace(/^Content-Security-Policy(-Report-Only)?:\s*/i, '');
    return body.split(';').map((d) => d.trim()).find((d) => d === name || d.startsWith(`${name} `)) || '';
}

test.describe('CSP 정책 파일(_headers) 검증', () => {
    test('script-src에 unsafe-inline 없음 + enforce(Report-Only 아님)', () => {
        const csp = readHeadersCsp();
        expect(csp, 'Content-Security-Policy 헤더가 있어야 함').toBeTruthy();
        expect(csp, 'enforce 정책이어야 함(Report-Only 금지)').not.toContain('Report-Only');
        const scriptSrc = directive(csp, 'script-src');
        expect(scriptSrc, 'script-src 지시어가 있어야 함').toBeTruthy();
        expect(scriptSrc).not.toContain("'unsafe-inline'");
        expect(scriptSrc).not.toContain("'unsafe-eval'");
        // 기본 정책도 self 기반이어야 한다(인라인 폴백 차단).
        expect(directive(csp, 'default-src')).toContain("'self'");
        expect(directive(csp, 'object-src')).toContain("'none'");
    });
});

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

    test('홈: 강화 CSP에서 언어 토글 + Auth UI 위반 0', async ({ page }) => {
        await enforceCsp(page);
        await mockApi(page, { loggedIn: true });
        const tracker = await trackCspViolations(page);

        await gotoSection(page, '');
        // 언어 토글(다수 모듈 innerHTML 재렌더 경로)
        await page.locator('.nav-lang [data-set-lang="en"]').click();
        await expect(page.locator('.nav-links a[href="#about"]')).toHaveText('About');
        // Auth UI(mock 로그인) 렌더
        await expect(page.locator('#volt-auth-desktop')).toContainText('Sign out');

        expect(await tracker.collect()).toEqual([]);
    });

    test('모바일 390px: 강화 CSP에서 모바일 메뉴 열기 위반 0', async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
        const page = await ctx.newPage();
        await enforceCsp(page);
        await mockApi(page);
        const tracker = await trackCspViolations(page);

        await gotoSection(page, '');
        // 모바일 메뉴 열기(이벤트 핸들러 addEventListener 경로)
        await page.locator('#hamburger').click();
        await expect(page.locator('#hamburger')).toHaveAttribute('aria-expanded', 'true');
        await expect(page.locator('#mobileMenu')).toBeVisible();
        await page.waitForTimeout(200);

        expect(await tracker.collect()).toEqual([]);
        await ctx.close();
    });

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

    test('관리자: 강화 CSP에서 공지 폼 입력·미리보기·저장 위반 0', async ({ page }) => {
        await enforceCsp(page);
        await mockApi(page);
        await page.route('**/api/admin/session', (route) => route.fulfill({ json: { authenticated: true } }));
        await page.route('**/api/admin/notices', (route) => route.fulfill({ json: { items: [] } }));
        await page.route('**/api/admin/ships', (route) => route.fulfill({ json: { items: [] } }));
        const tracker = await trackCspViolations(page);

        await page.goto('/admin/');
        await expect(page.locator('#dashboard')).toBeVisible();
        await page.locator('#new-button').click();

        // KO/EN 입력 → 미리보기 라이브 갱신(동적 innerHTML)
        await page.locator('#cms-form [name="title"]').fill('한글 제목');
        await page.locator('#cms-form [name="content"]').fill('한글 본문');
        await page.locator('#notice-title-en').fill('EN Title');
        await expect(page.locator('#notice-preview-ko')).toContainText('한글 제목');
        await expect(page.locator('#notice-preview-en')).toContainText('EN Title');
        // 저장(mock)
        await page.locator('button[type="submit"][form="cms-form"]').click();
        await expect(page.locator('#form-message')).toContainText('저장');

        expect(await tracker.collect()).toEqual([]);
    });
});
