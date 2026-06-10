const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
    testDir: './tests/smoke',
    timeout: 30_000,
    expect: { timeout: 7_500 },
    fullyParallel: true,
    reporter: process.env.CI ? [['github'], ['list']] : 'list',
    use: {
        baseURL: 'http://127.0.0.1:4173',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure'
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
    ],
    webServer: {
        command: 'node tests/support/static-server.mjs',
        url: 'http://127.0.0.1:4173',
        reuseExistingServer: !process.env.CI,
        timeout: 30_000
    }
});
