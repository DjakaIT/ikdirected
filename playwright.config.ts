import { defineConfig, devices } from "@playwright/test";

// The built site exactly as on the hosting: static dist/ + the PHP admin API behind scripts/dev-router.php
// (emulates the .htaccess files). IK_TEST=1 gives every test its own data namespace (tests/e2e/admin-fixture.ts).
const PORT = 4329;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 360, height: 780 },
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: "reduced",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" },
    },
  ],
  webServer: {
    command: `npm run build && node scripts/serve.mjs --port ${PORT} --data .local/e2e --fresh`,
    url: `http://127.0.0.1:${PORT}/api/admin/auth/state`,
    env: { IK_TEST: "1" },
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
