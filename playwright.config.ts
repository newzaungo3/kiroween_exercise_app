import { defineConfig } from '@playwright/test';

// Port 3100 avoids a dev server the user may run by hand on 3000.
const port = 3100;
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  reporter: [['list']],
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    {
      name: 'phone',
      use: {
        browserName: 'chromium',
        viewport: { width: 360, height: 640 },
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      },
    },
    {
      name: 'laptop',
      use: {
        browserName: 'chromium',
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    // Production build, then the Next.js production server. Never the dev server.
    command: `npm run build && npm run start -- --port ${port}`,
    url: baseURL,
    // Fail if the port is already taken instead of testing a stray server.
    reuseExistingServer: false,
    // One budget for the Build plus the server start.
    timeout: 300_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
