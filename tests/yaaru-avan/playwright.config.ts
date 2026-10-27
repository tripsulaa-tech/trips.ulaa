import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: 'browser.spec.ts', fullyParallel: false, workers: 1, timeout: 45000,
  use: { actionTimeout: 7000, baseURL: 'http://127.0.0.1:4173', headless: true, launchOptions: { executablePath: process.env.YA_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] }, viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' },
  webServer: { cwd: new URL('../..', import.meta.url).pathname, command: 'npx vite --config tests/yaaru-avan/vite.config.mjs', url: 'http://127.0.0.1:4173/tests/yaaru-avan/index.html', reuseExistingServer: true },
});
