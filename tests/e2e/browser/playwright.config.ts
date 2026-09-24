import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const candidateAppRoot = process.env.OBJECTQUEST_E2E_APP_ROOT;
const appPort = process.env.OBJECTQUEST_E2E_PORT ?? "5174";
const appUrl = `http://127.0.0.1:${appPort}`;
const outputDir = process.env.OBJECTQUEST_E2E_OUTPUT_DIR ??
  join(tmpdir(), `objectquest-playwright-results-${process.pid}`);

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.test.ts",
  outputDir,
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: appUrl,
    channel: "chrome",
    headless: true,
    viewport: { width: 1280, height: 720 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: candidateAppRoot
    ? {
        command: `npx vite --host 127.0.0.1 --port ${appPort} --strictPort`,
        cwd: candidateAppRoot,
        url: appUrl,
        reuseExistingServer: false,
        timeout: 30_000,
      }
    : {
        command: `npx vite ../../.. --host 127.0.0.1 --port ${appPort} --strictPort`,
        url: appUrl,
        reuseExistingServer: false,
        timeout: 30_000,
      },
});
