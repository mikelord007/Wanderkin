/** Render identical-camera PNG evidence for the original and styled meshes. */
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { createServer } from "vite";

const root = resolve(import.meta.dirname, "../..");
const evidenceDir = resolve(root, "docs/evidence");
await mkdir(evidenceDir, { recursive: true });

const server = await createServer({
  root,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 4179, strictPort: true },
});

const browser = await chromium.launch({ headless: true });
try {
  await server.listen();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const cases = [
    {
      asset: "/samples/rodin.glb",
      title: "Original-photo Rodin mesh (bundled baseline)",
      output: "style-spike-original-mesh.png",
    },
    {
      asset: "/scripts/spike/output/photo-4-cartoon-rodin.glb",
      title: "Cartoon-reference Rodin mesh (bounded spike)",
      output: "style-spike-cartoon-mesh.png",
    },
  ];
  for (const item of cases) {
    const url = new URL("http://127.0.0.1:4179/scripts/spike/viewer.html");
    url.searchParams.set("asset", item.asset);
    url.searchParams.set("title", item.title);
    await page.goto(url.toString(), { waitUntil: "networkidle" });
    await page.waitForFunction(() => (window as typeof window & { __OBJECTQUEST_READY__?: boolean }).__OBJECTQUEST_READY__);
    await page.screenshot({ path: resolve(evidenceDir, item.output) });
  }
} finally {
  await browser.close();
  await server.close();
}
