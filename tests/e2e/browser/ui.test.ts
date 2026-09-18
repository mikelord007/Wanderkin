import { expect, test, type Page } from "@playwright/test";
import { startApiServer, type ApiServerHandle } from "../http/helpers/apiServer.js";
import { startFakeMcpServer, type FakeMcpServer } from "../http/helpers/fakeMcpServer.js";
import { defaultMcpHandlers } from "../http/helpers/mcpHandlers.js";

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

test.beforeEach(async ({ page }) => {
  // The browser uses its own isolated API process/storage, while Vite serves
  // the real client on :5174. Forwarding is transparent to the app and keeps
  // every provider-facing request on the local fake MCP endpoint.
  await page.route("**/api/**", async (route) => {
    const original = new URL(route.request().url());
    await route.continue({ url: `${api.baseUrl}${original.pathname}${original.search}` });
  });
});

async function openEditorForSample(page: Page, sampleName: string): Promise<void> {
  const sampleSection = page.getByRole("heading", { name: "Play a sample" }).locator("..");
  const card = sampleSection.locator("article").filter({ hasText: sampleName });
  await card.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("heading", { name: "Model orientation" }).waitFor();
}

test("photo lightbox follows real left/right/Escape keyboard input", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "From photos" }).click();
  await page.getByRole("heading", { name: "Add your photos" }).waitFor();

  await page.locator('input[type="file"]').setInputFiles([
    "public/samples/photo-1.jpg",
    "public/samples/photo-2.jpg",
  ]);
  const firstPhoto = page.getByRole("button", { name: "Enlarge photo 1" });
  try {
    await firstPhoto.waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    throw new Error(`Photo upload UI did not become ready:\n${await page.locator("body").innerText()}`);
  }
  await firstPhoto.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAttribute("aria-label", /Photo 1/);
  await expect(dialog).toContainText("1 of 2");
  await page.keyboard.press("ArrowRight");
  await expect(dialog).toHaveAttribute("aria-label", /Photo 2/);
  await expect(dialog).toContainText("2 of 2");
  await page.keyboard.press("ArrowLeft");
  await expect(dialog).toContainText("1 of 2");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();

  // Uploading photos is local-only in this test; no generation tool call is
  // allowed merely by exercising the selection/lightbox UI.
  expect(mcp.callsFor("run_capability")).toHaveLength(0);
});

test("editor scale, spawn, checkpoint, and helper edits survive save and reload", async ({ page }) => {
  await page.goto("/");
  await openEditorForSample(page, "Room corner — Rodin");

  const orientation = page.getByRole("heading", { name: "Model orientation" }).locator("..");
  await orientation.getByLabel("Uniform scale").fill("4.5");

  const spawnAndCheckpoints = page.getByRole("heading", { name: "Spawn & checkpoints" }).locator("..");
  await spawnAndCheckpoints.locator(".oq-editor__vec3").first().getByLabel("X").fill("-3.9");
  await spawnAndCheckpoints
    .locator(".oq-editor__checkpoint-item")
    .first()
    .getByLabel("Trigger radius (m)")
    .fill("0.55");

  const helpers = page.getByRole("heading", { name: "Helper geometry (ramps & platforms)" }).locator("..");
  await helpers.locator(".oq-editor__helper-list li").first().getByLabel("width").fill("11.5");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
  await page.reload();

  const savedSection = page.getByRole("heading", { name: "Your saved levels" }).locator("..");
  const savedCard = savedSection.locator("article").filter({ hasText: "Room corner — Rodin" });
  await savedCard.getByRole("button", { name: "Edit" }).click();
  await page.getByRole("heading", { name: "Model orientation" }).waitFor();

  const reloadedOrientation = page.getByRole("heading", { name: "Model orientation" }).locator("..");
  await expect(reloadedOrientation.getByLabel("Uniform scale")).toHaveValue("4.5");
  const reloadedSpawn = page.getByRole("heading", { name: "Spawn & checkpoints" }).locator("..");
  await expect(reloadedSpawn.locator(".oq-editor__vec3").first().getByLabel("X")).toHaveValue("-3.9");
  await expect(
    reloadedSpawn.locator(".oq-editor__checkpoint-item").first().getByLabel("Trigger radius (m)"),
  ).toHaveValue("0.55");
  const reloadedHelpers = page
    .getByRole("heading", { name: "Helper geometry (ramps & platforms)" })
    .locator("..");
  await expect(reloadedHelpers.locator(".oq-editor__helper-list li").first().getByLabel("width")).toHaveValue(
    "11.5",
  );
});
