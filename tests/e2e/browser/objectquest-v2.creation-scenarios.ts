import { expect, type BrowserContext, type Page } from "@playwright/test";
import { mkdir } from "node:fs/promises";

type CapturedRequest = { path: string; body: any };
const now = "2026-09-24T10:00:00.000Z";
const provenance = { providerId: "fixture", requestedCapability: "fixture", servedCapability: "fixture", servedModel: "fixture", applicationJobId: "fixture", providerJobId: "fixture", timings: { requestedAt: now }, reportedCost: null };

function job(id: string, kind: string, state: string, result?: any, retryable = true) {
  return { schemaVersion: 1, id, idempotencyKey: `${id}-key`, providerId: "fixture", providerJobId: `provider-${id}`, capabilityRequested: "fixture", capabilityUsed: "fixture", fallbackFired: null, state, photoOrder: [], createdAt: now, updatedAt: now, retryCount: 0, maxRetries: 2, kind, ...(result ? { result } : {}), ...(state === "failed" ? { lastError: { message: `${kind} needs another try.`, retryable, occurredAt: now } } : {}) };
}

export async function installCreationMock(page: Page, options: { shapeState?: "generating" | "ready"; failMusic?: boolean } = {}) {
  const captured: CapturedRequest[] = [];
  const previewAsset = { id: "preview-1", url: "/samples/photo-2.jpg", sha256: "2".repeat(64), sizeBytes: 2048, mimeType: "image/jpeg", width: 900, height: 700, provenance };
  const cutoutAsset = { ...previewAsset, id: "cutout-1", url: "/samples/photo-4.jpg", sha256: "1".repeat(64) };
  const meshAsset = { id: "mesh-1", url: "/samples/rodin.glb", sha256: "7".repeat(64), sizeBytes: 1024, provenance };
  const states = new Map<string, any>();
  states.set("shape-1", { ...job("shape-1", "image-to-3d", options.shapeState ?? "ready", { kind: "image-to-3d", asset: meshAsset }), resultAssetId: "mesh-1" });
  await page.route("**/api/**", async route => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
    const body = request.headers()["content-type"]?.includes("application/json") ? request.postDataJSON() : null;
    if (request.method() !== "GET") captured.push({ path, body });
    if (path === "/api/levels") return route.fulfill({ json: [] });
    if (path === "/api/uploads") return route.fulfill({ json: [{ id: "photo-1", url: "/samples/photo-4.jpg", order: 1, label: "Object photo" }] });
    if (path === "/api/jobs/previews") { states.set("preview-job", job("preview-job", "image-edit", "ready", { kind: "image-edit", asset: previewAsset })); return route.fulfill({ status: 201, json: { cacheHit: false, approved: false, cacheKey: "a".repeat(64), job: job("preview-job", "image-edit", "queued") } }); }
    if (/\/api\/jobs\/preview-cache\/.+\/approve$/.test(path)) return route.fulfill({ json: { key: "a".repeat(64), jobId: "preview-job", approved: true, createdAt: now, updatedAt: now, job: states.get("preview-job") } });
    if (path === "/api/jobs/generate") {
      const requestBody = body?.request;
      if (requestBody?.kind === "image-edit") { states.set("object-job", job("object-job", "image-edit", "ready", { kind: "image-edit", asset: cutoutAsset })); return route.fulfill({ status: 201, json: job("object-job", "image-edit", "queued") }); }
      if (requestBody?.kind === "image-to-3d") return route.fulfill({ status: 201, json: states.get("shape-1") });
      if (requestBody?.kind === "music") { const value = options.failMusic ? job("music-1", "music", "failed", undefined, true) : job("music-1", "music", "ready", { kind: "music", asset: { schemaVersion: 1, mediaType: "audio", kind: "music", id: "music", url: "/fixture.mp3", sha256: "3".repeat(64), sizeBytes: 10, mimeType: "audio/mpeg", durationSeconds: 60, loop: true, defaultGain: .7, provenance } }); states.set("music-1", value); return route.fulfill({ status: 201, json: value }); }    }
    const match = path.match(/^\/api\/jobs\/([^/]+)$/); if (match) return route.fulfill({ json: states.get(match[1]!) ?? states.get("shape-1") });
    if (/\/api\/jobs\/.+\/retry$/.test(path)) { const id = path.split("/")[3]!; const value = { ...(states.get(id) ?? job(id, "music", "queued")), state: "queued", lastError: undefined }; states.set(id, value); return route.fulfill({ json: value }); }
    if (path === "/api/assets/mesh-1") return route.fulfill({ json: meshAsset });
    return route.fulfill({ status: 404, json: { message: `Unhandled fixture route ${path}` } });
  });
  return captured;
}

export async function uploadToReview(page: Page) {
  await page.goto("/"); await page.getByRole("button", { name: "Create my world" }).first().click();
  await page.locator('input[type="file"]').setInputFiles("public/samples/photo-4.jpg");
  await page.getByRole("button", { name: "Use this photo" }).click();
  await expect(page.getByRole("heading", { name: "Here’s your object." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Looks good" })).toBeEnabled();
}

export async function runB5(page: Page, _context: BrowserContext) {
  await installCreationMock(page); await uploadToReview(page);
  await page.getByRole("button", { name: "Adjust crop" }).click(); await page.locator('.oq-review__crop input[type="range"]').first().fill("1.25");
  await page.getByRole("button", { name: "Done adjusting" }).click(); await page.getByRole("button", { name: "Looks good" }).click();
  await expect(page.getByRole("heading", { name: "What kind of adventure is this?" })).toBeVisible();
}

export async function runB6(page: Page) {
  const captured = await installCreationMock(page); await uploadToReview(page); await page.getByRole("button", { name: "Looks good" }).click();
  await page.locator(".oq-kit-choice").filter({ hasText: "Watercolor" }).click(); expect(captured.filter(item => item.body?.request?.kind === "image-to-3d")).toHaveLength(0);
  await page.getByRole("button", { name: "Continue" }).click(); await expect(page.getByRole("heading", { name: "Where will it grow?" })).toBeVisible(); await page.locator(".oq-kit-choice").filter({ hasText: "Monsoon Marsh" }).click(); await page.getByRole("button", { name: "Continue" }).click(); await expect(page.getByRole("heading", { name: "Like this direction?" })).toBeVisible(); await expect(page.getByRole("button", { name: "Use this preview" })).toBeEnabled();
  await page.getByRole("button", { name: "Use this preview" }).click(); await expect(page.getByRole("button", { name: "Build my world" })).toBeVisible(); await page.reload(); await expect(page.getByText("Approved for build")).toBeVisible();
  await page.getByRole("button", { name: "Build my world" }).click(); await expect(page.getByRole("heading", { name: "Your world is taking shape." })).toBeVisible();
  const builds = captured.filter(item => item.body?.request?.kind === "image-to-3d"); expect(builds).toHaveLength(1); expect(builds[0]!.body.request).toMatchObject({ sourceImageAssetIds: ["cutout-1"], styleReferenceAssetId: "preview-1" });
}

function seedCreation(step: string, jobs: any) { return { schemaVersion: 1, id: "world-seeded", createdAt: now, updatedAt: now, step, useOriginalImage: false, crop: { scale: 1, x: 0, y: 0 }, selection: { style: "cartoon", mode: "collect", atmosphere: "Cloud garden", biome: "monsoon" }, photo: { id: "photo-1", url: "/samples/photo-4.jpg", order: 1 }, preview: { cacheKey: "a".repeat(64), jobId: "preview-job", asset: { id: "preview-1", url: "/samples/photo-2.jpg", sha256: "2".repeat(64), sizeBytes: 10, mimeType: "image/jpeg", width: 900, height: 700, provenance }, selection: { style: "cartoon", mode: "collect", atmosphere: "Cloud garden", biome: "monsoon" }, approvedAt: now }, jobs } }
async function seed(page: Page, record: any, activeJob = true) { await page.addInitScript(({ record, activeJob }) => { localStorage.setItem("objectquest:v2:creations", JSON.stringify([record])); localStorage.setItem("objectquest:v2:active-creation", record.id); if (activeJob) localStorage.setItem("objectquest:activeSource", JSON.stringify({ kind: "job", jobId: "shape-1", photos: [record.photo] })); }, { record, activeJob }); }

export async function runB10(page: Page) {
  await installCreationMock(page, { shapeState: "generating" }); await seed(page, seedCreation("building", { shape: { id: "shape-1", state: "generating", kind: "image-to-3d" } }));
  await page.goto("/"); await expect(page.getByRole("heading", { name: "Your world is taking shape." })).toBeVisible(); await page.reload(); await expect(page.getByRole("heading", { name: "Your world is taking shape." })).toBeVisible();
  await page.getByRole("button", { name: "My worlds" }).click(); await expect(page.getByRole("button", { name: "View progress" })).toBeVisible(); await page.getByRole("button", { name: "View progress" }).click(); await expect(page.getByRole("heading", { name: "Your world is taking shape." })).toBeVisible();
}

export async function runB11(page: Page) {
  await installCreationMock(page, { shapeState: "ready", failMusic: true }); await seed(page, seedCreation("building", { shape: { id: "shape-1", state: "ready", kind: "image-to-3d" }, music: { id: "music-1", state: "failed", kind: "music", retryable: true } }));
  await page.goto("/"); await expect(page.getByText("Your world is still safe.")).toBeVisible(); await expect(page.getByRole("button", { name: "Prepare my course" })).toBeEnabled(); await expect(page.getByRole("button", { name: "Retry music" })).toBeVisible();
}

export async function runB14(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/levels", route => route.fulfill({ json: [] }));
  await page.goto("/");

  const playSample = page.getByRole("button", { name: "Play a sample" }).first();
  await expect(playSample).toBeEnabled();
  await playSample.focus();
  await expect(playSample).toBeFocused();
  await page.keyboard.press("Enter");

  const enterGame = page.locator(".oq-hud__overlay--invite button", { hasText: "Play" });
  await expect(enterGame).toBeVisible({ timeout: 45_000 });
  await enterGame.focus();
  await page.keyboard.press("Enter");

  await expect(page.locator(".oq-hud__intro")).toBeVisible();
  const sound = page.getByRole("button", { name: "Sound" });
  await sound.focus();
  await expect(sound).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("group", { name: "Sound" })).toBeVisible();

  const mute = page.getByRole("button", { name: "Mute sound" });
  await mute.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Unmute sound" })).toHaveAttribute("aria-pressed", "true");
  for (const label of ["Master", "Music", "Effects"]) await expect(page.getByLabel(label)).toBeVisible();
  await expect(page.getByLabel("Voice")).toHaveCount(0);
  await page.getByLabel("Music").press("ArrowLeft");
  await expect(page.getByLabel("Music")).toHaveValue("49");
  const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem("objectquest:audio-settings:v1") ?? "null"));
  expect(persisted).toMatchObject({ muted: true, music: 49 });
  expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);

  await mkdir("test-results/objectquest-v2", { recursive: true });
  await page.screenshot({ path: "test-results/objectquest-v2/B14-audio-accessibility.png", fullPage: true });
}

export async function runB15(page: Page, context: BrowserContext) {
  await installCreationMock(page); await context.clearPermissions(); await page.goto("/"); await page.getByRole("button", { name: "Create my world" }).first().click(); await page.getByRole("button", { name: "Take a photo" }).click(); await expect(page.getByText("Camera unavailable. Choose a photo instead.")).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles({ name: "not-a-photo.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not an image") }); await expect(page.getByText(/does not appear to be a valid photo/)).toBeVisible(); await page.locator('input[type="file"]').setInputFiles("public/samples/photo-4.jpg"); await expect(page.getByRole("button", { name: "Use this photo" })).toBeEnabled();
}

export async function runB19(page: Page) {
  await installCreationMock(page); const draft = seedCreation("customize", {}); draft.id = "draft"; const pending = seedCreation("building", { shape: { id: "shape-1", state: "generating", kind: "image-to-3d" } }); pending.id = "pending"; const failed = seedCreation("preview", { preview: { id: "preview-job", state: "failed", kind: "image-edit", retryable: true } }); failed.id = "failed"; const terminal = seedCreation("preview", { preview: { id: "preview-terminal", state: "failed", kind: "image-edit", retryable: false } }); terminal.id = "terminal";
  await page.addInitScript(records => { localStorage.setItem("objectquest:v2:creations", JSON.stringify(records)); localStorage.removeItem("objectquest:v2:active-creation"); localStorage.removeItem("objectquest:activeSource"); }, [draft, pending, failed, terminal]); await page.goto("/");
  await expect(page.getByRole("button", { name: "Resume" })).toHaveCount(1); await expect(page.getByRole("button", { name: "View progress" })).toHaveCount(1); await expect(page.getByRole("button", { name: "Retry", exact: true })).toHaveCount(1); await expect(page.getByRole("button", { name: "Review choices" })).toHaveCount(1);
}
