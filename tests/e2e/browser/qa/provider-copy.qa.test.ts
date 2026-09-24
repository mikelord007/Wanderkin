import { expect, test } from "@playwright/test";
import { startApiServer, type ApiServerHandle } from "../../http/helpers/apiServer.js";
import { startFakeMcpServer, type FakeMcpServer } from "../../http/helpers/fakeMcpServer.js";
import { defaultMcpHandlers } from "../../http/helpers/mcpHandlers.js";

let api: ApiServerHandle;
let mcp: FakeMcpServer;

test.beforeAll(async () => {
  mcp = await startFakeMcpServer(defaultMcpHandlers());
  api = await startApiServer({ mcpEndpoint: mcp.url });
});

test.afterAll(async () => {
  await api?.stop();
  await mcp?.close();
});

test("bundled and saved worlds keep provider names out of player-facing copy", async ({ page }, testInfo) => {
  await page.route("**/api/**", async (route) => {
    const source = new URL(route.request().url());
    await route.continue({ url: `${api.baseUrl}${source.pathname}${source.search}` });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "The desk & sofa adventure" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "A different perspective" })).toBeVisible();
  await expect(page.getByText(/Room corner — (Rodin|Tripo)/)).toHaveCount(0);

  const sample = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "The desk & sofa adventure" }),
  });
  await sample.getByRole("button", { name: "Edit course" }).click();
  await page.getByRole("heading", { name: "Model orientation" }).waitFor();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  await page.reload();

  const saved = page.getByRole("article")
    .filter({ hasText: "The desk & sofa adventure" })
    .filter({ hasText: "Generated world" });
  await expect(saved).toBeVisible();
  await expect(page.getByText(/Room corner — (Rodin|Tripo)/)).toHaveCount(0);
  await saved.screenshot({ path: testInfo.outputPath("provider-neutral-saved-world.png") });
  expect(mcp.callsFor("run_capability")).toHaveLength(0);
});
