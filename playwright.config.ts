import { defineConfig, devices } from '@playwright/test';
import { config } from 'dotenv';
config({ quiet: true });
if (
  !process.env.TEST_DATABASE_URL ||
  new URL(process.env.TEST_DATABASE_URL).pathname !== '/settlecraft_test'
)
  throw new Error('E2E requires the dedicated test database');
export default defineConfig({
  testDir: './apps/web/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'desktop',
      use: {
        channel: 'chrome',
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: 'mobile',
      use: {
        ...devices['Pixel 7'],
        channel: 'chrome',
        defaultBrowserType: 'chromium',
        viewport: { width: 360, height: 800 },
      },
    },
  ],
  webServer: [
    {
      command: 'npm run db:migrate && npm run db:seed && npm run dev -w @settlecraft/api',
      url: 'http://127.0.0.1:4001/api/v1/health/ready',
      reuseExistingServer: false,
      env: {
        DATABASE_URL: process.env.TEST_DATABASE_URL,
        PORT: '4001',
        APP_ORIGIN: 'http://127.0.0.1:5174',
        NODE_ENV: 'test',
      },
    },
    {
      command: 'npm run dev -w @settlecraft/web -- --port 5174',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      env: { VITE_API_TARGET: 'http://127.0.0.1:4001' },
    },
  ],
});
