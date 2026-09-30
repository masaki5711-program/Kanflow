import { defineConfig, devices } from "@playwright/test"

/**
 * Kanflow E2E / smoke tests.
 *
 * - Runs against an already running server (no webServer block): set
 *   E2E_BASE_URL, default http://localhost:3001 (the dev server).
 * - Chromium only. @playwright/test is pinned to 1.59.x because its bundled
 *   Chromium revision (1217) is the one pre-installed under
 *   %LOCALAPPDATA%\ms-playwright — browser downloads are blocked on the
 *   corporate network, so do not run `playwright install` there.
 * - e2e/smoke/*  : read-only, safe against any environment (incl. shared DB).
 * - e2e/flows/*  : create data; skipped unless E2E_ALLOW_WRITE=1 and
 *                  E2E_USER / E2E_PASSWORD are set. Run them ONLY against a
 *                  separate test database, never production.
 */
const baseURL = process.env.E2E_BASE_URL || "http://localhost:3001"

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Dev server compiles routes on first hit; keep generous timeouts.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  workers: process.env.CI ? 1 : 2,
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  outputDir: "test-results",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    navigationTimeout: 60_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
