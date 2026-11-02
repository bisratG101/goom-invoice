import { defineConfig, devices } from '@playwright/test';

const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  timeout: 60000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 720 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: `${npmCmd} --prefix backend run dev`,
      url: 'http://localhost:4001/health',
      reuseExistingServer: false,
      timeout: 30000,
      env: {
        ...process.env,
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5434/goom_test',
        DEMO_MODE: 'true',
        PORT: '4001',
        NODE_ENV: 'development',
        CORS_ORIGIN: 'http://localhost:5174',
        APP_BASE_URL: 'http://localhost:5174',
        API_BASE_URL: 'http://localhost:4001',
      },
    },
    {
      command: `${npmCmd} --prefix frontend run dev -- --port 5174`,
      url: 'http://localhost:5174',
      reuseExistingServer: false,
      timeout: 30000,
      env: {
        ...process.env,
        VITE_API_URL: 'http://localhost:4001/api/v1',
      },
    },
  ],
});
