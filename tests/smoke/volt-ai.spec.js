const { test, expect } = require('@playwright/test');
const { mockApi, gotoSection } = require('./helpers');

// M1 VOLT AI: 게이트(비활성/비로그인/멤버)와 근거 표시(출처·기준 시각) 계약을 고정한다.
// 모델·백엔드는 전부 모킹 — 프런트는 /api/ai/chat 단일 관문만 안다.

function mockAiConfig(page, { enabled = true } = {}) {
    return page.route('**/api/ai/chat', (route) => {
        if (route.request().method() === 'GET') {
            return route.fulfill({ json: { enabled, memberOnly: true, dailyLimit: 200 } });
        }
        return route.fallback();
    });
}

const CHAT_RESPONSE = {
    ok: true,
    intent: 'recommend',
    answer: '화물 조건에 맞는 함선은 asgard(220 SCU)입니다.',
    aiNote: '대형 수송 위주로 추천됐고, 소수 인원 운용이라면 승무원 수를 함께 확인하세요.',
    sources: [{ label: 'VOLT ShipDB — Erkul live 데이터 레이어', detail: '동기화 2026-07-08T12:00:00.000Z', url: '#ships' }],
    freshness: { label: 'ShipDB 동기화', at: '2026-07-08T12:00:00.000Z' },
    usage: { dayCount: 1, dayLimit: 200 }
};

test.describe('VOLT AI (M1)', () => {
    test('비활성: 준비 중 UI 유지 + 입력 비활성', async ({ page }) => {
        await mockApi(page);
        await mockAiConfig(page, { enabled: false });
        await gotoSection(page, '#ai');

        await expect(page.locator('#volt-ai-input')).toBeDisabled();
        await expect(page.locator('#volt-ai-send')).toBeDisabled();
        await expect(page.locator('.volt-ai-status-badge')).toContainText('준비 중');
    });

    test('활성+비로그인: 멤버 전용 안내 + 로그인 링크, 입력은 잠금', async ({ page }) => {
        await mockApi(page); // loggedIn: false
        await mockAiConfig(page);
        await gotoSection(page, '#ai');

        await expect(page.locator('.volt-ai-status-badge')).toHaveText('MEMBERS');
        await expect(page.locator('#volt-ai-messages')).toContainText('Discord 멤버 전용');
        await expect(page.locator('.volt-ai-login-link')).toHaveAttribute('href', '/auth/discord/login');
        await expect(page.locator('#volt-ai-input')).toBeDisabled();
    });

    test('멤버 대화: 답변 + 출처 카드 + 기준 시각 렌더', async ({ page }) => {
        await mockApi(page, { loggedIn: true });
        await mockAiConfig(page);
        await page.route('**/api/ai/chat', (route) => {
            if (route.request().method() === 'POST') return route.fulfill({ json: CHAT_RESPONSE });
            return route.fallback();
        });
        await gotoSection(page, '#ai');

        await expect(page.locator('.volt-ai-status-badge')).toHaveText('BETA');
        const input = page.locator('#volt-ai-input');
        await expect(input).toBeEnabled();
        await input.fill('화물 100 SCU 이상 함선 추천');
        await page.locator('#volt-ai-send').click();

        const log = page.locator('#volt-ai-messages');
        await expect(log).toContainText('화물 100 SCU 이상 함선 추천');
        await expect(log).toContainText('asgard(220 SCU)');
        // M1.1: 모델 보조 설명은 확정 답변과 분리된 참고 블록으로 표시
        await expect(log.locator('.volt-ai-note .volt-ai-note-label')).toContainText('AI 해설');
        await expect(log.locator('.volt-ai-note-text')).toContainText('승무원 수를 함께 확인');
        await expect(log.locator('.volt-ai-source-card')).toContainText('Erkul live');
        await expect(log.locator('.volt-ai-freshness')).toContainText('ShipDB 동기화');
    });

    test('한도 초과(429): 재시도 안내 표시', async ({ page }) => {
        await mockApi(page, { loggedIn: true });
        await mockAiConfig(page);
        await page.route('**/api/ai/chat', (route) => {
            if (route.request().method() === 'POST') {
                return route.fulfill({ status: 429, json: { error: '오늘의 AI 사용 한도에 도달했습니다.' } });
            }
            return route.fallback();
        });
        await gotoSection(page, '#ai');

        await page.locator('#volt-ai-input').fill('공지 알려줘');
        await page.locator('#volt-ai-send').click();
        await expect(page.locator('#volt-ai-messages')).toContainText('한도에 도달했습니다');
    });

    test('새 대화: 로그가 안내 버블 하나로 초기화', async ({ page }) => {
        await mockApi(page, { loggedIn: true });
        await mockAiConfig(page);
        await page.route('**/api/ai/chat', (route) => {
            if (route.request().method() === 'POST') return route.fulfill({ json: CHAT_RESPONSE });
            return route.fallback();
        });
        await gotoSection(page, '#ai');

        await page.locator('#volt-ai-input').fill('추천');
        await page.locator('#volt-ai-send').click();
        await expect(page.locator('#volt-ai-messages .volt-ai-message')).toHaveCount(3);

        await page.locator('#volt-ai-new-chat').click();
        await expect(page.locator('#volt-ai-messages .volt-ai-message')).toHaveCount(1);
        await expect(page.locator('#volt-ai-messages')).toContainText('VOLT AI입니다');
    });
});
