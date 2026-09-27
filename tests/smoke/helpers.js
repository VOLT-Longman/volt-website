const fs = require('node:fs');
const vm = require('node:vm');
const fixture = { window: {} };
vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname, '../../data/volt-data.js'), 'utf8'), fixture);
const cmsData = fixture.window.VOLT_DATA;
const cmsProperties = { notices: 'announcements', events: 'calendar', gallery: 'gallery', 'partner-fleets': 'partnerFleets', leadership: 'leadership', timeline: 'timeline' };
// 스모크 테스트 공통 헬퍼.
// 정적 서버에는 functions/ API가 없으므로 모든 백엔드 호출을 모킹한다.
// CMS 엔드포인트는 정적 fixture의 실제 items 계약으로 응답한다.

const TEST_USER = {
    sub: 'test-user',
    username: 'tester',
    display_name: '테스트 사용자',
    avatar_url: '',
    roles: ['member'],
};

async function mockApi(page, { loggedIn = false } = {}) {
    await page.route('**/auth/me', (route) => route.fulfill({
        json: loggedIn ? { logged_in: true, user: TEST_USER } : { logged_in: false },
    }));
    // 정상 응답과 실패/빈 목록을 구분해 회귀를 검증한다.
    await page.route(/\/api\/(notices|events|gallery|partner-fleets|ship-overrides|leadership|timeline)$/, (route) => route.fulfill({ json: { items: cmsData[cmsProperties[new URL(route.request().url()).pathname.split('/').pop()]] || [] } }));
    await page.route('**/api/uex/**', (route) => route.fulfill({ json: { status: 'ok', data: [] } }));
    await page.route('**/api/discord-stats', (route) => route.fulfill({ json: { memberCount: 1234 } }));
    await page.route('**/api/me/**', (route) => route.fulfill({ json: { items: [], preferences: { favorites: [], planner: {} } } }));
    await page.route(/\/api\/events\/[^/]+\/rsvp$/, (route) => route.fulfill({ json: { going: false, count: 0 } }));
    // VOLT AI 상태 조회(M1) — 기본 비활성. AI 테스트는 나중 등록 라우트로 덮어쓴다.
    await page.route('**/api/ai/chat', (route) => {
        if (route.request().method() === 'GET') return route.fulfill({ json: { enabled: false, memberOnly: true, dailyLimit: 0 } });
        return route.fulfill({ status: 503, json: { error: 'VOLT AI가 비활성화되어 있습니다.' } });
    });
}

function trackConsoleErrors(page) {
    const errors = [];
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(String(error)));
    return errors;
}

async function gotoSection(page, hash) {
    await page.goto(`/${hash || ''}`);
    await page.waitForSelector('#loading-splash', { state: 'hidden' });
}

module.exports = { mockApi, trackConsoleErrors, gotoSection, TEST_USER };
