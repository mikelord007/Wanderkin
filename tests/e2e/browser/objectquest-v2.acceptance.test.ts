import { runB5, runB6, runB10, runB11, runB14, runB15, runB19 } from "./objectquest-v2.creation-scenarios.js";
import { mkdir, readFile, stat } from "node:fs/promises";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { createEmptyManifest, migrateSceneManifest, type SceneManifest } from "../../../shared/index.js";
import { startApiServer, type ApiServerHandle } from "../http/helpers/apiServer.js";
import { startFakeMcpServer, type FakeMcpServer } from "../http/helpers/fakeMcpServer.js";
import { defaultMcpHandlers } from "../http/helpers/mcpHandlers.js";

let api: ApiServerHandle;
let mcp: FakeMcpServer;
const lostColorsFixture = JSON.parse(
  await readFile(new URL("../../../shared/fixtures/lost-colors.json", import.meta.url), "utf8"),
) as Record<string, unknown>;

test.beforeAll(async () => {
  await mkdir("test-results/worker7", { recursive: true });
  await mkdir("test-results/worker8", { recursive: true });
  mcp = await startFakeMcpServer(defaultMcpHandlers());
  api = await startApiServer({ mcpEndpoint: mcp.url });
});

test.afterAll(async () => {
  await api?.stop();
  await mcp?.close();
});

async function routeApi(context: Page | BrowserContext): Promise<void> {
  await context.route("**/api/**", async (route) => {
    const original = new URL(route.request().url());
    await route.continue({ url: `${api.baseUrl}${original.pathname}${original.search}` });
  });
}

test.beforeEach(async ({ page }) => routeApi(page));

async function seedLevel(manifest: SceneManifest): Promise<SceneManifest> {
  const response = await fetch(`${api.baseUrl}/api/levels`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(manifest),
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<SceneManifest>;
}

function helperWorld(id: string, race = false): SceneManifest {
  const base = createEmptyManifest({ levelId: id, name: `Worker 7 ${id}`, seed: id, movementConfigId: "default-v1" });
  base.photos = [{ id: `${id}-private-photo`, url: "/samples/photo-1.jpg", order: 1 }];
  base.entities = [{
    id: "floor",
    kind: "floor",
    transform: { position: [0, -0.2, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    dimensions: [12, 0.4, 12],
    collider: { kind: "box", halfExtents: [6, 0.2, 6] },
    addedBy: "game",
  }];
  base.spawn = { position: [0, 0.37, 0], headingRadians: 0 };
  base.checkpoints = [{
    id: "checkpoint-1",
    order: 0,
    position: [2, 0.37, 0],
    triggerRadius: 0.5,
    safeRespawn: { position: [2, 0.37, 0], headingRadians: 0 },
  }];
  const hydrated = migrateSceneManifest(base);
  if (!race) return hydrated;
  const portal = {
    id: "finish-portal",
    kind: "finish-portal" as const,
    transform: { position: [3, 0.8, 0] as [number, number, number], rotation: [0, 0, 0, 1] as [number, number, number, number], scale: [0.8, 1.2, 0.25] as [number, number, number] },
    triggerRadius: 0.75,
    activation: "all-race-checkpoints" as const,
    inactiveColor: "#6D6780",
    activeColor: "#9B5DE5",
  };
  return {
    ...hydrated,
    experience: {
      ...hydrated.experience,
      mode: { kind: "race", countdownSeconds: 3, orderedCheckpointIds: ["checkpoint-1"], finishPortalId: portal.id, restartPolicy: "full-reset" },
      finishPortal: portal,
    },
  };
}

async function publish(levelId: string, body: unknown) {
  const response = await fetch(`${api.baseUrl}/api/levels/${levelId}/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(201);
  return response.json() as Promise<{ shareId: string; versionId: string; challenge: unknown; manifest: SceneManifest }>;
}

interface GameplayDiagnostics {
  playerPosition: readonly [number, number, number];
  cameraYaw: number;
}

async function driveTo(page: Page, target: readonly [number, number], timeout = 20_000): Promise<void> {
  const held = new Set<"w" | "a" | "s" | "d">();
  const deadline = Date.now() + timeout;
  try {
    while (Date.now() < deadline) {
      const current = await page.evaluate(() => window.__objectquest?.get() as GameplayDiagnostics | null ?? null);
      if (!current) {
        if (await page.getByRole("button", { name: "Play again" }).count()) return;
        await page.waitForTimeout(50);
        continue;
      }
      const dx = target[0] - current.playerPosition[0];
      const dz = target[1] - current.playerPosition[2];
      const distance = Math.hypot(dx, dz);
      if (distance < 0.28) return;
      const length = distance || 1;
      const x = dx / length;
      const z = dz / length;
      const forward = x * Math.sin(current.cameraYaw) + z * Math.cos(current.cameraYaw);
      const right = x * -Math.cos(current.cameraYaw) + z * Math.sin(current.cameraYaw);
      const wanted = new Set<"w" | "a" | "s" | "d">();
      if (forward > .18) wanted.add("w"); else if (forward < -.18) wanted.add("s");
      if (right > .18) wanted.add("d"); else if (right < -.18) wanted.add("a");
      for (const key of held) if (!wanted.has(key)) { await page.keyboard.up(key); held.delete(key); }
      for (const key of wanted) if (!held.has(key)) { await page.keyboard.down(key); held.add(key); }
      await page.waitForTimeout(70);
    }
  } finally {
    for (const key of held) await page.keyboard.up(key);
  }
  const final = await page.evaluate(() => window.__objectquest?.get() ?? null);
  throw new Error(`Timed out driving to ${target.join(",")}; final diagnostics: ${JSON.stringify(final)}`);
}

async function openSavedWorld(page: Page, manifest: SceneManifest): Promise<void> {
  await page.goto("/");
  const card = page.getByRole("article").filter({ hasText: manifest.name }).last();
  await card.getByRole("button", { name: "Play", exact: true }).click();
  await expect(page.locator(".oq-screen--play canvas")).toBeVisible();
  await expect(page.getByRole("button", { name: /^Play$/ })).toBeVisible();
}

async function completeSingleCheckpointWorld(page: Page, warmupMilliseconds = 0): Promise<void> {
  await page.getByRole("button", { name: /^Play$/ }).click();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement !== null)).toBe(true);
  if (warmupMilliseconds) await page.waitForTimeout(warmupMilliseconds);
  await driveTo(page, [2, 0]);
  await expect(page.getByRole("button", { name: "Play again" })).toBeVisible({ timeout: 20_000 });
}

/**
 * ObjectQuest v2 section-10 browser contracts.
 *
 * Every case is deliberately skipped until its owning Worker 4–8 feature is
 * integrated. Remove `skip` only when the written steps run through visible UI
 * and real browser input. Provider-backed cases must retain network/job
 * evidence and must not turn a fixture result into a live-provider claim.
 */
test.describe("ObjectQuest v2 real-browser acceptance contracts", () => {
  test.skip("B1 plays and replays both original bundled sample levels", async ({ page, context }) => {
    // 1. Start from clean storage and open each Rodin/Tripo bundled-world card.
    // 2. Use pointer lock, mouse camera, movement, jump, and mantle controls;
    //    collect ordered checkpoints and reach the visible finish naturally.
    // 3. Replay each world and assert progress resets without a generation call.
    // 4. Record browser/device plus console, collision, and loading warnings.
    void page;
    void context;
    throw new Error("Browser contract stub B1: extend existing sample coverage for the integrated v2 shell");
  });

  test.skip("B2 completes the Lost Colors adventure with staged restoration", async ({ page }) => {
    // 1. Open the bundled Lost Colors world and begin with 0/3 fragments and
    //    the finish portal visibly inactive.
    // 2. Collect red, yellow, and blue using real movement; after each pickup,
    //    assert 1/3, 2/3, 3/3 and a visibly increasing color-restoration stage.
    // 3. Cross a fragment trigger twice and assert no duplicate reward/SFX.
    // 4. Enter the now-active portal, see the result screen, then replay cleanly.
    void page;
    throw new Error("Browser contract stub B2: connect Worker 5 Lost Colors UI/runtime");
  });

  test.skip("B3 shows Cartoon, Hand-painted, and Watercolor in actual gameplay rendering", async ({ page }) => {
    // 1. Create/open the same recognizable object and select each style in turn.
    // 2. Enter gameplay—not only the preview—and capture matched camera views.
    // 3. Assert the active style ID/version and visible materials, lighting,
    //    environment, effects, and UI treatment change for all three styles.
    // 4. Confirm collision/course identity remains equivalent for comparison.
    void page;
    throw new Error("Browser contract stub B3: connect Worker 3 styling and Worker 5 play rendering");
  });

  test.skip("B4 exercises Explore, Collect, and Race through their own completion rules", async ({ page }) => {
    // 1. Complete an Explore objective and assert its configured finish event.
    // 2. In Collect, prove the portal rejects early entry, then collect all
    //    required fragments and finish.
    // 3. In Race, observe countdown, traverse ordered checkpoints, finish, and
    //    inspect elapsed time/result without using teleport or state mutation.
    void page;
    throw new Error("Browser contract stub B4: connect Worker 5 mode flows");
  });

  test("B5 uploads or captures an image and reviews the isolated object", async ({ page, context }) => {
    // 1. Upload a valid rotated photo; review corrected orientation and object.
    // 2. Replace/crop/accept it and prove only the accepted source is selected.
    // 3. If capture is supported, grant camera permission, capture, retake, and
    //    accept through visible controls; record unsupported-device behavior.
    // 4. Confirm no paid generation request occurs during object review.
    await runB5(page, context);
  });

  test("B6 requires explicit preview approval before the matching 3D build", async ({ page }) => {
    // 1. Choose style A, create its preview, then switch to style B and preview.
    // 2. Inspect network/jobs: neither selection nor preview may submit 3D.
    // 3. Approve B, refresh, and assert the approved preview remains identifiable.
    // 4. Click Build once; assert one image-to-3D request uses B's exact durable
    //    asset/digest, style version, atmosphere, mode, and source identity.
    await runB6(page);
  });

  test.skip("B7 restarts and respawns without duplicate rewards or stale race time", async ({ page }) => {
    // 1. Collect one fragment, record reward count, then fall out of bounds and
    //    manually respawn from a later safe checkpoint.
    // 2. Assert progress is preserved and reward/narration do not repeat.
    // 3. Start a Race, advance timer/checkpoints, choose Restart, and assert a
    //    fresh countdown, zero elapsed time, initial progress, and no stale result.
    void page;
    throw new Error("Browser contract stub B7: connect Worker 5 restart/respawn HUD state");
  });

  test("B8 edits and persists all supported v2 course entities", async ({ page }) => {
    const manifest = migrateSceneManifest({ ...lostColorsFixture, levelId: "worker7-b8" });
    await seedLevel(manifest);
    await page.goto("/");
    const card = page.getByRole("article").filter({ hasText: manifest.name }).last();
    await card.getByRole("button", { name: "Edit" }).click();
    const spawnPanel = page.getByRole("heading", { name: "Spawn & checkpoints" }).locator("..");
    await spawnPanel.locator(".oq-editor__vec3").first().getByLabel("X").fill("-3.5");
    await spawnPanel.locator(".oq-editor__checkpoint-item").first().getByLabel("Trigger radius (m)").fill("0.65");
    const markers = page.getByRole("heading", { name: "Collectibles & finish" }).locator("..");
    await markers.locator(".oq-editor__checkpoint-item").first().locator(".oq-editor__vec3").getByLabel("X").fill("-3.25");
    await markers.locator(".oq-editor__checkpoint-item").last().getByLabel("Trigger radius (m)").fill("0.9");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Saved.", { exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole("article").filter({ hasText: manifest.name }).last().getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("heading", { name: "Spawn & checkpoints" }).locator("..").locator(".oq-editor__vec3").first().getByLabel("X")).toHaveValue("-3.5");
    await expect(page.getByRole("heading", { name: "Collectibles & finish" }).locator("..").locator(".oq-editor__checkpoint-item").first().locator(".oq-editor__vec3").getByLabel("X")).toHaveValue("-3.25");
    await expect(page.getByRole("heading", { name: "Collectibles & finish" })).toBeVisible();
    await page.screenshot({ path: "test-results/worker7/B8-editor-entities.png", fullPage: true });
  });

  test("B9 reloads a saved world with style, mission, and audio references intact", async ({ page }) => {
    const manifest = migrateSceneManifest({ ...lostColorsFixture, levelId: "worker7-b9" });
    manifest.experience.style.id = "watercolor";
    manifest.experience.quest.objective = "Keep this exact mission after a full reload.";
    manifest.media = {
      audio: [{
        schemaVersion: 1,
        mediaType: "audio",
        kind: "music",
        id: "worker7-b9-music",
        url: "/samples/worker7-theme.mp3",
        sha256: "a".repeat(64),
        sizeBytes: 2048,
        mimeType: "audio/mpeg",
        durationSeconds: 42,
        loop: true,
        defaultGain: 0.6,
        provenance: {
          providerId: "acceptance-fixture",
          requestedCapability: "music",
          servedCapability: "music",
          servedModel: "fixture/music-v1",
          applicationJobId: "worker7-b9-audio-job",
          providerJobId: "fixture-audio-1",
          timings: { requestedAt: "2026-09-24T10:00:00.000Z", completedAt: "2026-09-24T10:00:01.000Z" },
          reportedCost: null,
        },
      }],
      video: [],
    };
    await seedLevel(manifest);
    await page.goto("/");
    await page.reload();
    const stored = await page.evaluate(async (id) => (await fetch(`/api/levels/${id}`)).json(), manifest.levelId) as SceneManifest;
    expect(stored.experience?.style.id).toBe("watercolor");
    expect(stored.experience?.quest.objective).toBe("Keep this exact mission after a full reload.");
    expect(stored.media).toEqual(manifest.media);
    await expect(page.getByRole("article").filter({ hasText: manifest.name }).last()).toContainText("watercolor");
    await page.screenshot({ path: "test-results/worker7/B9-saved-style-mission.png", fullPage: true });
  });

  test("B10 resumes a pending generation after refresh using the same job", async ({ page }) => {
    // 1. Start a deliberately delayed fake/authorized generation and capture
    //    application/provider job IDs while the world is visibly pending.
    // 2. Refresh, navigate away, and return through My worlds Resume.
    // 3. Observe continued progress to ready/failed with identical IDs and one
    //    provider submission; no duplicate uploads or generation are allowed.
    await runB10(page);
  });

  test("B11 keeps the level usable when an optional audio or video job fails", async ({ page }) => {
    // 1. Begin with a playable saved level and successful mesh/one media asset.
    // 2. Induce or observe a narration/postcard failure and inspect honest UI.
    // 3. Enter/replay, edit, save, and share the level while that asset is failed.
    // 4. Retry only the failed kind and assert the mesh/course/successful asset
    //    IDs remain unchanged and no image-to-3D request is submitted.
    await runB11(page);
  });

  test("B12 opens and plays an immutable shared course in a separate browser session", async ({ browser }) => {
    const source = await seedLevel(helperWorld("worker7-b12"));
    const publication = await publish(source.levelId, { challenge: { kind: "completion" } });
    expect(publication.manifest.photos).toEqual([]);

    const friendContext = await browser.newContext();
    await routeApi(friendContext);
    const friend = await friendContext.newPage();
    await friend.goto(`/share/${publication.shareId}`);
    await expect(friend.getByRole("heading", { level: 1 })).toContainText(source.name);
    await expect(friend.getByText(publication.versionId, { exact: true })).toBeVisible();
    await expect(friend.getByText("No photo upload or world generation is needed.", { exact: false })).toBeVisible();
    await expect(friend.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    await expect(friend.getByRole("button", { name: /edit|upload|generate/i })).toHaveCount(0);
    await expect(friend.locator(".oq-friend__preview canvas")).toBeVisible();
    await friend.screenshot({ path: "test-results/worker7/B12-friend-landing.png", fullPage: true });
    await friend.getByRole("button", { name: "Play", exact: true }).click();
    await expect(friend.locator(".oq-screen--play")).toBeVisible();
    await friendContext.close();
  });

  test("B13 compares a race only against the same published course version", async ({ browser }) => {
    const source = await seedLevel(helperWorld("worker7-b13", true));
    const original = await publish(source.levelId, {
      challenge: { kind: "race", targetMilliseconds: 12_345, verification: "personal-unverified" },
    });

    const challengerContext = await browser.newContext();
    await routeApi(challengerContext);
    const challenger = await challengerContext.newPage();
    await challenger.goto(`/share/${original.shareId}`);
    await expect(challenger.getByText("Creator’s target: 12.35 seconds · unverified", { exact: true })).toBeVisible();
    await expect(challenger.getByText(original.versionId, { exact: true })).toBeVisible();

    const edited = { ...source, name: `${source.name} revised privately` };
    const save = await fetch(`${api.baseUrl}/api/levels/${source.levelId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(edited),
    });
    expect(save.status).toBe(200);
    const newer = await publish(source.levelId, {
      challenge: { kind: "race", targetMilliseconds: 20_000, verification: "personal-unverified" },
    });
    expect(newer.versionId).not.toBe(original.versionId);

    await challenger.reload();
    await expect(challenger.getByText("Creator’s target: 12.35 seconds · unverified", { exact: true })).toBeVisible();
    await expect(challenger.getByText(original.versionId, { exact: true })).toBeVisible();
    await challenger.goto(`/share/${newer.shareId}`);
    await expect(challenger.getByText("Creator’s target: 20.00 seconds · unverified", { exact: true })).toBeVisible();
    await expect(challenger.getByText(newer.versionId, { exact: true })).toBeVisible();
    await expect(challenger.locator(".oq-friend__preview canvas")).toBeVisible();
    await challenger.screenshot({ path: "test-results/worker7/B13-version-bound-race.png", fullPage: true });
    await challengerContext.close();
  });

  test("B14 supports mute, subtitles, keyboard focus, and reduced motion", async ({ page }) => {
    // 1. Navigate creation, game HUD, pause, and results with keyboard only;
    //    focus remains visible, ordered, untrapped, and returns after dialogs.
    // 2. Toggle master/music/SFX/narration mute and verify channel behavior.
    // 3. Enable subtitles and observe timed narration/event copy.
    // 4. Emulate reduced motion before load; verify non-essential motion/effects
    //    reduce without hiding state or preventing completion.
    const audioRequests: string[] = [];
    page.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (/^\/audio\/[^/]+\.wav$/.test(path)) audioRequests.push(path);
    });

    await runB14(page);

    const narration = page.getByText(/Welcome to Teacup Island\. Find the three lost colors/);
    await expect(narration).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.__objectquest?.audio() ?? null)).toMatchObject({
      unlocked: true,
      contextState: "running",
      playing: true,
      activeLoops: expect.arrayContaining(["music", "ambience"]),
    });
    expect(audioRequests).toContain("/audio/lost-colors-loop.wav");

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("r");
    await expect.poll(() => audioRequests).toContain("/audio/fall-respawn.wav");
    expect(audioRequests.filter((path) => path === "/audio/narration-intro.wav")).toHaveLength(1);

    await expect(narration).toBeHidden({ timeout: 12_000 });
    await page.getByRole("button", { name: "Pause game" }).focus();
    await page.keyboard.press("Enter");
    await page.getByRole("button", { name: "Restart course" }).focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(500);
    await expect(narration).toBeHidden();
    expect(audioRequests.filter((path) => path === "/audio/narration-intro.wav")).toHaveLength(1);
  });

  test("B15 recovers from camera denial and gives useful invalid-input errors", async ({ page, context }) => {
    // 1. Deny camera permission and assert a clear explanation plus working upload fallback.
    // 2. Try wrong MIME/magic bytes, empty, oversized, and excessive-dimension images.
    // 3. Each error identifies the remedy, retains safe prior state, and permits
    //    a subsequent valid upload without refresh.
    // 4. Inspect requests to prove invalid inputs reach no billable endpoint.
    await runB15(page, context);
  });

  test("B16 records, previews, and downloads an actual gameplay highlight where supported", async ({ page }) => {
    const manifest = await seedLevel(helperWorld("worker8-b16"));
    const providerCallsBefore = mcp.callsFor("create_media").length;
    await openSavedWorld(page, manifest);
    await page.getByRole("button", { name: "Start gameplay capture" }).click();
    await expect(page.getByRole("button", { name: "Stop gameplay capture" })).toBeVisible();
    await completeSingleCheckpointWorld(page, 1200);

    const preview = page.getByLabel("Actual gameplay highlight preview");
    await expect(preview).toBeVisible();
    await expect(page.getByText("Actual gameplay", { exact: true })).toBeVisible();
    const media = await preview.evaluate(async (element: HTMLVideoElement) => {
      const response = await fetch(element.src);
      return { size: (await response.arrayBuffer()).byteLength, type: response.headers.get("content-type"), width: element.videoWidth };
    });
    expect(media.size).toBeGreaterThan(100);
    expect(media.type).toContain("video/webm");

    await page.screenshot({ path: "test-results/worker8/B16-gameplay-highlight.png", fullPage: true });
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Download gameplay highlight" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/gameplay-highlight\.webm$/);
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    expect((await stat(downloadPath!)).size).toBeGreaterThan(100);
    expect(mcp.callsFor("create_media")).toHaveLength(providerCallsBefore);
  });

  test("B17 resumes, previews, and downloads a postcard from a mocked successful image-to-video job", async ({ page }) => {
    const manifest = await seedLevel(helperWorld("worker8-b17"));
    await page.goto("/");
    const postcardBytes = Buffer.from(await page.evaluate(async () => {
      const canvas = document.createElement("canvas");
      canvas.width = 320; canvas.height = 180;
      const context = canvas.getContext("2d")!;
      const stream = canvas.captureStream(12);
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm" });
      const chunks: Blob[] = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      const stopped = new Promise<Blob>((resolve) => { recorder.onstop = () => resolve(new Blob(chunks, { type: "video/webm" })); });
      recorder.start(40);
      context.fillStyle = "#84d6ac"; context.fillRect(0, 0, 320, 180);
      context.fillStyle = "#2d2254"; context.font = "bold 24px sans-serif"; context.fillText("Animated postcard", 45, 98);
      await new Promise((resolve) => setTimeout(resolve, 180));
      recorder.stop();
      const bytes = new Uint8Array(await (await stopped).arrayBuffer());
      let binary = ""; for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary);
    }), "base64");

    const videoAsset = {
      schemaVersion: 1, mediaType: "video", kind: "animated-postcard", id: "mock-postcard-video",
      url: "/fixtures/postcard.webm", sha256: "6".repeat(64), sizeBytes: postcardBytes.byteLength,
      mimeType: "video/webm", durationSeconds: 5, width: 320, height: 180, source: "generated-animation",
      provenance: {
        providerId: "mock-livepeer", requestedCapability: "pixverse-i2v", servedCapability: "pixverse-i2v",
        servedModel: "fixture/pixverse-i2v", applicationJobId: "job-worker8-b17", providerJobId: "provider-worker8-b17",
        timings: { requestedAt: "2026-09-24T11:00:00.000Z", completedAt: "2026-09-24T11:00:45.000Z", totalMilliseconds: 45_000 },
        reportedCost: { amount: 0.34125, currency: "USD", unit: "generated-second" },
      },
    } as const;
    const readyJob = {
      schemaVersion: 1, id: "job-worker8-b17", idempotencyKey: "postcard_worker8-b17", providerId: "mock-livepeer",
      providerJobId: "provider-worker8-b17", capabilityRequested: "pixverse-i2v", capabilityUsed: "pixverse-i2v",
      fallbackFired: null, state: "ready", photoOrder: [1], createdAt: "2026-09-24T11:00:00.000Z",
      updatedAt: "2026-09-24T11:00:45.000Z", completedAt: "2026-09-24T11:00:45.000Z",
      retryCount: 0, maxRetries: 3, kind: "video", resultAssetId: videoAsset.id,
      provenance: videoAsset.provenance, result: { kind: "video", asset: videoAsset },
    } as const;
    let submitted = false;
    let screenshotPayload = "";
    await page.route("**/fixtures/postcard.webm", (route) => route.fulfill({ status: 200, contentType: "video/webm", body: postcardBytes }));
    await page.route("**/api/postcards/worker8-b17/screenshot", async (route) => {
      screenshotPayload = (route.request().postDataJSON() as { imageBase64: string }).imageBase64;
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({
        id: "mock-screenshot", url: "/fixtures/screenshot.png", sha256: "a".repeat(64), sizeBytes: 2048,
        mimeType: "image/png", width: 1280, height: 720, provenance: { ...videoAsset.provenance, requestedCapability: "browser-world-capture" },
      }) });
    });
    await page.route("**/api/postcards/worker8-b17", async (route) => {
      if (route.request().method() === "POST") {
        submitted = true;
        const saved = { ...manifest, media: { audio: [], video: [videoAsset] } };
        const response = await fetch(`${api.baseUrl}/api/levels/${manifest.levelId}`, {
          method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(saved),
        });
        if (!response.ok) throw new Error(`Mock postcard persistence failed: ${await response.text()}`);
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(submitted
        ? { state: "job", cacheHit: route.request().method() === "GET", job: readyJob }
        : { state: "none", cacheHit: false }) });
    });

    await openSavedWorld(page, manifest);
    await completeSingleCheckpointWorld(page);
    await page.getByRole("button", { name: "Create animated postcard" }).click();
    await expect(page.getByLabel("Generated animated postcard preview")).toBeVisible();
    expect(submitted).toBe(true);
    expect(screenshotPayload.length).toBeGreaterThan(100);

    await page.reload();
    const card = page.getByRole("article").filter({ hasText: manifest.name }).last();
    await expect(card.getByText(/Generated animation · Animated postcard/)).toBeVisible();
    await expect(card.getByLabel("Generated animated postcard preview")).toBeVisible();
    await page.screenshot({ path: "test-results/worker8/B17-animated-postcard.png", fullPage: true });
    const downloadPromise = page.waitForEvent("download");
    await card.getByRole("link", { name: "Download postcard" }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).not.toBeNull();
    expect((await stat(downloadPath!)).size).toBeGreaterThan(100);

    const stored = await (await fetch(`${api.baseUrl}/api/levels/${manifest.levelId}`)).json() as SceneManifest;
    expect(stored.media?.video[0]?.provenance).toMatchObject({
      requestedCapability: "pixverse-i2v", servedCapability: "pixverse-i2v", servedModel: "fixture/pixverse-i2v",
      applicationJobId: "job-worker8-b17", providerJobId: "provider-worker8-b17",
      reportedCost: { amount: 0.34125, currency: "USD" },
    });
  });

  test("B18 replays a saved world without submitting any generation job", async ({ page }) => {
    const source = await seedLevel(helperWorld("worker7-b18"));
    const providerCallsBefore = mcp.callsFor("run_capability").length;
    const jobRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/jobs")) jobRequests.push(request.url());
    });

    await page.goto("/");
    let card = page.getByRole("article").filter({ hasText: source.name }).last();
    await card.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.locator(".oq-screen--play")).toBeVisible();
    await page.reload();
    card = page.getByRole("article").filter({ hasText: source.name }).last();
    await card.getByRole("button", { name: "Play", exact: true }).click();
    await expect(page.locator(".oq-screen--play")).toBeVisible();
    await page.screenshot({ path: "test-results/worker7/B18-replay-no-jobs.png", fullPage: true });
    expect(jobRequests).toEqual([]);
    expect(mcp.callsFor("run_capability")).toHaveLength(providerCallsBefore);
  });

  test("B19 exposes correct My worlds actions for saved and draft worlds", async ({ page }) => {
    const ready = await seedLevel(helperWorld("worker7-b19-ready"));
    const withDraft = await seedLevel(helperWorld("worker7-b19-draft"));
    const draft = {
      levelId: withDraft.levelId,
      baseUpdatedAt: withDraft.updatedAt,
      manifest: { ...withDraft, name: `${withDraft.name} unsaved edit` },
      savedAt: "2026-09-24T12:00:00.000Z",
    };
    await page.addInitScript((value) => {
      localStorage.setItem(`objectquest:editorDraft:${value.levelId}`, JSON.stringify(value));
    }, draft);

    await page.goto("/");
    const readyCard = page.getByRole("article").filter({ hasText: ready.name }).last();
    await expect(readyCard.getByText("Generated world", { exact: true })).toBeVisible();
    await expect(readyCard.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    await expect(readyCard.getByRole("button", { name: "Edit", exact: true })).toBeVisible();
    await expect(readyCard.getByRole("button", { name: "Export", exact: true })).toBeVisible();

    const draftCard = page.getByRole("article").filter({ hasText: withDraft.name }).last();
    await expect(draftCard.getByText("Draft changes", { exact: true })).toBeVisible();
    await expect(draftCard.getByRole("button", { name: "Resume", exact: true })).toBeVisible();
    await expect(draftCard.getByRole("button", { name: "Play saved", exact: true })).toBeVisible();
    await expect(draftCard.getByRole("button", { name: "Export", exact: true })).toBeVisible();
    await expect(draftCard.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
    await page.screenshot({ path: "test-results/worker7/B19-my-worlds-actions.png", fullPage: true });
  });

  test("B19 exposes correct My worlds actions for creation jobs", async ({ page }) => {
    await runB19(page);
  });
});
