import { defineConfig } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Isolated batch-2 verification harness. Mirrors the product's own
 * tests/e2e/browser config but runs from nimbalyst-local, on its own
 * disposable port, so protected 5173/8787/15173/18799 are untouched.
 */
const appPort = process.env.OQ_BATCH2_PORT ?? "15931";
const appUrl = `http://127.0.0.1:${appPort}`;

export default defineConfig({
  testDir: ".",
  testMatch: "**/*.test.ts",
  outputDir: join(tmpdir(), `oq-batch2-controls-${process.pid}`),
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: appUrl,
    channel: "chrome",
    headless: process.env.OQ_BATCH2_HEADED ? false : true,
    viewport: { width: 1280, height: 720 },
    trace: "retain-on-failure",
    video: "off",
  },
  webServer: {
    command: `npx vite ../.. --host 127.0.0.1 --port ${appPort} --strictPort`,
    url: appUrl,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
