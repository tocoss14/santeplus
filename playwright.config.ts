import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  workers: 2,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    // localhost et non 127.0.0.1 : l'anti-CSRF de l'API n'autorise que
    // WEB_ORIGIN (http://localhost:3000 en dev) sur les mutations authentifiées.
    baseURL: process.env.WEB_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  // API E2E n'a pas besoin de webServer — lance `npm run dev` manuellement avant `npx playwright test`
  // Pour CI, decommentez webServer ci-dessous :
  // webServer: [
  //   { command: 'npm run dev -w apps/api', url: 'http://127.0.0.1:4000/api/health', reuseExistingServer: true, timeout: 30_000 },
  //   { command: 'npm run dev -w apps/web', url: 'http://127.0.0.1:3000', reuseExistingServer: true, timeout: 30_000 },
  // ],
});
