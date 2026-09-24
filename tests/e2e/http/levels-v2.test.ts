import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createEmptyManifest,
  migrateSceneManifest,
  type PublishedLevelVersion,
  type SceneManifest,
} from "../../../shared/index.js";
import legacyFixture from "../../../shared/fixtures/legacy-scene-manifest-v1.json";
import lostColorsFixture from "../../../shared/fixtures/lost-colors.json";
import workflowFixture from "../../../shared/fixtures/world-workflow-v1.json";
import { startApiServer, type ApiServerHandle } from "./helpers/apiServer.js";
import { startFakeMcpServer, type FakeMcpServer } from "./helpers/fakeMcpServer.js";
import { defaultMcpHandlers } from "./helpers/mcpHandlers.js";

function playableHelperWorld(levelId: string): SceneManifest {
  const manifest = createEmptyManifest({
    levelId,
    name: "A Shareable Tiny Island",
    seed: levelId,
    movementConfigId: "default-v1",
  });
  manifest.photos = [{ id: "private-photo", url: "/samples/photo-1.jpg", order: 1 }];
  manifest.entities = [{
    id: "floor",
    kind: "floor",
    transform: { position: [0, -0.2, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    dimensions: [12, 0.4, 12],
    collider: { kind: "box", halfExtents: [6, 0.2, 6] },
    addedBy: "game",
  }];
  manifest.spawn = { position: [0, 0.37, 0], headingRadians: 0 };
  manifest.checkpoints = [{
    id: "checkpoint-1",
    order: 0,
    position: [2, 0.37, 0],
    triggerRadius: 0.5,
    safeRespawn: { position: [2, 0.37, 0], headingRadians: 0 },
  }];
  return migrateSceneManifest(manifest);
}

describe("v2 level persistence, publication, and replay over the real HTTP server", () => {
  let api: ApiServerHandle;
  let mcp: FakeMcpServer;

  beforeAll(async () => {
    mcp = await startFakeMcpServer(defaultMcpHandlers());
    api = await startApiServer({ mcpEndpoint: mcp.url });
  }, 30_000);

  afterAll(async () => {
    await api?.stop();
    await mcp?.close();
  });

  async function create(manifest: unknown): Promise<SceneManifest> {
    const response = await fetch(`${api.baseUrl}/api/levels`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(manifest),
    });
    expect(response.status).toBe(201);
    return response.json() as Promise<SceneManifest>;
  }

  it("round-trips every v2 block, including the resumable workflow snapshot", async () => {
    const created = await create({ ...lostColorsFixture, levelId: "http-v2-roundtrip", workflow: workflowFixture });
    const response = await fetch(`${api.baseUrl}/api/levels/${created.levelId}`);
    expect(response.status).toBe(200);
    const reloaded = (await response.json()) as SceneManifest;
    expect(reloaded.experience).toEqual(lostColorsFixture.experience);
    expect(reloaded.media).toEqual(lostColorsFixture.media);
    expect(reloaded.workflow).toEqual(workflowFixture);
    expect(reloaded.assets).toEqual(lostColorsFixture.assets);
  });

  it("loads a legacy manifest through deterministic v2 hydration", async () => {
    const created = await create({ ...legacyFixture, levelId: "http-legacy" });
    expect(created.schemaVersion).toBe(1);
    expect(created.entities).toEqual(legacyFixture.entities);
    expect(created.spawn).toEqual(legacyFixture.spawn);
    expect(created.experience?.mode.kind).toBe("explore");
  });

  it("keeps a published version immutable and hides photos/workflow by default", async () => {
    const source = playableHelperWorld("http-publish");
    source.workflow = migrateSceneManifest({ ...lostColorsFixture, workflow: workflowFixture }).workflow;
    const saved = await create(source);

    const publishResponse = await fetch(`${api.baseUrl}/api/levels/${saved.levelId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge: { kind: "completion" } }),
    });
    expect(publishResponse.status).toBe(201);
    const first = (await publishResponse.json()) as PublishedLevelVersion;
    expect(first.manifest.photos).toEqual([]);
    expect(first.manifest).not.toHaveProperty("workflow");

    const edited: SceneManifest = {
      ...saved,
      name: "A later private title",
      experience: saved.experience
        ? {
            ...saved.experience,
            style: { ...saved.experience.style, id: "watercolor" },
            quest: { ...saved.experience.quest, objective: "A later private objective." },
          }
        : undefined,
    };
    const saveResponse = await fetch(`${api.baseUrl}/api/levels/${saved.levelId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(edited),
    });
    expect(saveResponse.status).toBe(200);

    const secondResponse = await fetch(`${api.baseUrl}/api/levels/${saved.levelId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge: { kind: "completion" } }),
    });
    expect(secondResponse.status).toBe(201);
    const second = (await secondResponse.json()) as PublishedLevelVersion;
    expect(second.versionId).not.toBe(first.versionId);
    expect(second.shareId).not.toBe(first.shareId);

    const originalShare = await fetch(`${api.baseUrl}/api/shares/${first.shareId}`);
    expect(await originalShare.json()).toEqual(first);
  });

  it("reopens and replays the same share without submitting any provider job", async () => {
    const saved = await create(playableHelperWorld("http-replay"));
    const published = await fetch(`${api.baseUrl}/api/levels/${saved.levelId}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ challenge: { kind: "completion" } }),
    });
    const version = (await published.json()) as PublishedLevelVersion;
    const submissionsBefore = mcp.callsFor("run_capability").length;

    const [firstReplay, secondReplay] = await Promise.all([
      fetch(`${api.baseUrl}/api/shares/${version.shareId}`),
      fetch(`${api.baseUrl}/api/shares/${version.shareId}`),
    ]);
    expect(await firstReplay.json()).toEqual(version);
    expect(await secondReplay.json()).toEqual(version);
    expect(mcp.callsFor("run_capability")).toHaveLength(submissionsBefore);
  });
});
