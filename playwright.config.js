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
