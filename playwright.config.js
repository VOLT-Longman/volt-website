const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/smoke',
    timeout: 30000,
    fullyParallel: true,
    retries: process.env.CI ? 2 : 0,
    reporter: process.env.CI ? [['github'], ['list']] : 'list',
    use: {
        baseURL: 'http://127.0.0.1:8787',
        viewport: { width: 1280, height: 800 },
        // 기본 한국어 기준으로 테스트(i18n 도입 후에도 기존 동작 보존). i18n 테스트는 컨텍스트별로 locale을 지정한다.
        locale: 'ko-KR',
        trace: 'retain-on-failure',
    },
    projects: [
        { name: 'chromium', use: { browserName: 'chromium' } },
    ],
    webServer: {
        command: 'node scripts/dev-server.js',
        port: 8787,
        reuseExistingServer: !process.env.CI,
    },
});
