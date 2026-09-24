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
  const card = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: sampleName }),
  });
  await card.getByRole("button", { name: "Edit course" }).click();
  await page.getByRole("heading", { name: "Model orientation" }).waitFor();
}

test("capture preview supports a real upload and replacement", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create my world" }).first().click();
  await page.getByRole("heading", { name: "What will your world be made of?" }).waitFor();

  const input = page.locator('input[type="file"][aria-label="Choose an object photo"]');
  await input.setInputFiles("public/samples/photo-1.jpg");
  const preview = page.getByRole("img", { name: "Your selected object" });
  await expect(preview).toBeVisible();
  await expect(page.getByText("Ready to review", { exact: true })).toBeVisible();
  const firstSource = await preview.getAttribute("src");

  await page.getByRole("button", { name: "Retake or replace" }).click();
  await input.setInputFiles("public/samples/photo-2.jpg");
  await expect.poll(() => preview.getAttribute("src")).not.toBe(firstSource);
  await expect(page.getByRole("button", { name: "Use this photo" })).toBeEnabled();

  // Choosing/replacing is local-only; no generation call is allowed merely
  // by exercising the capture preview.
  expect(mcp.callsFor("run_capability")).toHaveLength(0);
});

test("editor scale, spawn, checkpoint, and helper edits survive save and reload", async ({ page }) => {
  await page.goto("/");
  await openEditorForSample(page, "The desk & sofa adventure");

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

  const savedCard = page.getByRole("article").filter({ hasText: "Room corner — Rodin" });
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

test("portable level export downloads and imports through the browser", async ({ page }) => {
  await page.goto("/");
  await openEditorForSample(page, "A different perspective");

  const orientation = page.getByRole("heading", { name: "Model orientation" }).locator("..");
  await orientation.getByLabel("Uniform scale").fill("6.75");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save & export", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.objectquest\.json$/);
  await expect(page.getByText("Bundle downloaded.", { exact: true })).toBeVisible();

  const bundlePath = await download.path();
  expect(bundlePath).not.toBeNull();

  await page.getByRole("button", { name: "Back", exact: true }).click();
  await page.getByRole("heading", { name: "Your everyday objects. Extraordinary little worlds." }).waitFor();
  await page.getByLabel("Choose a world bundle").setInputFiles(bundlePath!);

  await page.getByRole("heading", { name: "Model orientation" }).waitFor();
  await expect(
    page.getByRole("heading", { name: "Model orientation" }).locator("..").getByLabel("Uniform scale"),
  ).toHaveValue("6.75");

  // A full reload must rediscover both the original saved level and the
  // newly imported copy from the isolated server's durable level index.
  await page.reload();
  await expect(page.getByRole("article").filter({ hasText: "Room corner — Tripo" })).toHaveCount(2);

  expect(mcp.callsFor("run_capability")).toHaveLength(0);
});

test("a real generated GLB prepares, switches candidates, and saves through the isolated API", async ({ page }) => {
  const generatedGlbPath = process.env.OBJECTQUEST_GENERATED_GLB_PATH;
  test.skip(!generatedGlbPath, "Set OBJECTQUEST_GENERATED_GLB_PATH to a previously generated local GLB artifact.");

  await page.goto("/");
  await page.getByLabel("Choose a 3D object").setInputFiles(generatedGlbPath!);

  const candidates = page.getByRole("radiogroup", { name: "Course candidate" });
  await expect(candidates).toBeVisible({ timeout: 60_000 });
  const radios = candidates.getByRole("radio");
  await expect(radios).toHaveCount(3);
  await expect(radios.nth(0)).toBeChecked();

  const orientation = page.getByRole("heading", { name: "Model orientation" }).locator("..");
  const originalScale = await orientation.getByLabel("Uniform scale").inputValue();
  await orientation.getByLabel("Uniform scale").fill("6.25");

  await radios.nth(1).check();
  await expect(radios.nth(1)).toBeChecked();
  await expect(orientation.getByLabel("Uniform scale")).toHaveValue(originalScale);
  await orientation.getByLabel("Uniform scale").fill("7.5");

  // Returning to the first option proves the primary did not disappear or
  // get replaced by the selected alternate. Candidate-specific drafts remain
  // independent: the primary's edit returns instead of the alternate's edit.
  await radios.nth(0).check();
  await expect(radios.nth(0)).toBeChecked();
  await expect(orientation.getByLabel("Uniform scale")).toHaveValue("6.25");

  await orientation.getByLabel("Uniform scale").fill("3.25");
  const spawn = page.getByRole("heading", { name: "Spawn & checkpoints" }).locator("..");
  await spawn.locator(".oq-editor__vec3").first().getByLabel("X").fill("2.75");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible();

  await page.reload();
  const savedCard = page.getByRole("article").filter({ hasText: "Imported level" });
  await expect(savedCard).toHaveCount(1);
  await savedCard.getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("heading", { name: "Model orientation" }).locator("..").getByLabel("Uniform scale"))
    .toHaveValue("3.25");
  await expect(
    page.getByRole("heading", { name: "Spawn & checkpoints" })
      .locator("..")
      .locator(".oq-editor__vec3")
      .first()
      .getByLabel("X"),
  ).toHaveValue("2.75");

  const levelsResponse = await fetch(`${api.baseUrl}/api/levels`);
  const levels = (await levelsResponse.json()) as Array<{
    name: string;
    assets: Array<{ sha256: string; url: string; sizeBytes: number }>;
  }>;
  const savedGeneratedLevel = levels.find((level) => level.name === "Imported level");
  expect(savedGeneratedLevel?.assets[0]).toMatchObject({
    sha256: "71d05f8c75bec0a46b5225640e94cdf5f2ac252fb49b81d8183f98eefba65c42",
    sizeBytes: 5_029_388,
  });
  const storedGlb = await fetch(`${api.baseUrl}${savedGeneratedLevel!.assets[0]!.url}`);
  expect(storedGlb.status).toBe(200);
  expect((await storedGlb.arrayBuffer()).byteLength).toBe(5_029_388);
  expect(mcp.callsFor("run_capability")).toHaveLength(0);
});
