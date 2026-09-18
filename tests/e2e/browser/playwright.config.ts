import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const candidateAppRoot = process.env.OBJECTQUEST_E2E_APP_ROOT;

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.test.ts",
  outputDir: join(tmpdir(), "objectquest-playwright-results-late-mist"),
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: "http://127.0.0.1:5174",
    channel: "chrome",
    headless: true,
    viewport: { width: 1280, height: 720 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: candidateAppRoot
    ? {
        command: "npx vite --host 127.0.0.1 --port 5174 --strictPort",
        cwd: candidateAppRoot,
        url: "http://127.0.0.1:5174",
        reuseExistingServer: false,
        timeout: 30_000,
      }
    : {
        command: "npx vite ../../.. --host 127.0.0.1 --port 5174 --strictPort",
        url: "http://127.0.0.1:5174",
        reuseExistingServer: false,
        timeout: 30_000,
      },
});
