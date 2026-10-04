import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser', timeout: 20000, workers: 1,
  use: { baseURL: 'http://127.0.0.1:8799', browserName: 'chromium', viewport: { width: 1280, height: 900 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: 'node dist/server/main.js', url: 'http://127.0.0.1:8799/health', reuseExistingServer: false,
    env: { G2_HARNESS_PORT: '8799', G2_HARNESS_TOKEN: 'browser-test-only-token-00000000000000' },
  },
});
