import { defineConfig } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// A new database per invocation; never seed or clear the developer's database.
const databasePath = process.env.CCPROJECT_E2E_DATABASE ?? join(mkdtempSync(join(tmpdir(), 'ccproject-e2e-')), 'api.sqlite');
process.env.CCPROJECT_E2E_DATABASE = databasePath;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60000,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH },
  },
  webServer: [
    {
      command: 'npm --prefix ../backend run build && npm --prefix ../backend run db:seed && npm --prefix ../backend start',
      url: 'http://127.0.0.1:3002/health',
      timeout: 60000,
      reuseExistingServer: false,
      env: { NODE_ENV: 'test', PORT: '3002', DB_PATH: databasePath, ENABLE_COLLAB_STUB: 'true', FRONTEND_ORIGINS: 'http://127.0.0.1:5174' },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5174',
      url: 'http://127.0.0.1:5174',
      timeout: 60000,
      reuseExistingServer: false,
      env: { VITE_API_MODE: 'local', VITE_API_BASE_URL: 'http://127.0.0.1:3002', VITE_AUTH_MODE: 'mock' },
    },
  ],
});
