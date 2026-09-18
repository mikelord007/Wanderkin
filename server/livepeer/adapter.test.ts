import { describe, expect, it, vi } from "vitest";
import type { McpToolCaller, McpToolCallOptions } from "./mcpClient.js";
import { McpToolError, McpTransportError } from "./mcpClient.js";
import { LivepeerAdapter, type PhotoBytesProvider } from "./adapter.js";

/** Successful wire fixture captured read-only from mjob_cfb2286bf2b5 on
 * 2026-09-18, trimmed to fields relevant to adapter normalization. Notably,
 * the job result names the capability but contains no model-id field. */
const RODIN_DONE_FIXTURE = {
  submitted_via: "run_capability",
  job_id: "mjob_cfb2286bf2b5",
  status: "done",
  capability: "rodin-i3d",
  capability_used: null,
  fallback_fired: null,
  url: "https://agent.livepeer.org/a/fake/rodin.glb",
  model_note: null,
  run_output: null,
  output_kind: "3d",
  seed: null,
  error: null,
};

const TRIPO_RUNNING_FIXTURE = {
  job_id: "mjob_c91e623855ae",
  status: "running",
  capability: "tripo-mv3d",
  capability_used: null,
  fallback_fired: null,
  url: null,
};

const FAILED_FIXTURE = {
  job_id: "mjob_deadbeef0000",
  status: "failed",
  error: "Upstream provider timed out",
  error_code: "provider_timeout",
  error_retryable: true,
};

function fakePhotos(): PhotoBytesProvider {
  return {
    getPhotoBytes: vi.fn(async (photoId: string) => ({
      buffer: Buffer.from(`bytes-for-${photoId}`),
      mimeType: "image/jpeg",
      filename: `${photoId}.jpg`,
    })),
  };
}

function fakeMcp(
  handlers: Record<string, (args: Record<string, unknown>) => unknown>,
): McpToolCaller & { calls: Array<{ name: string; args: Record<string, unknown> }> } {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    async callTool<T>(name: string, args: Record<string, unknown>, _options?: McpToolCallOptions): Promise<T> {
      calls.push({ name, args });
      const handler = handlers[name];
      if (!handler) throw new Error(`Unexpected tool call "${name}"`);
      return handler(args) as T;
    },
  };
}

describe("LivepeerAdapter.validateInput", () => {
  const adapter = new LivepeerAdapter(fakeMcp({}), fakePhotos());

  it("accepts 1-5 rodin photos with no view slots", () => {
    const result = adapter.validateInput("rodin-i3d", [
      { photoId: "a", sourceIndex: 4 },
      { photoId: "b", sourceIndex: 1 },
    ]);
    expect(result.valid).toBe(true);
  });

  it("rejects more than 5 rodin photos", () => {
    const photos = Array.from({ length: 6 }, (_, i) => ({ photoId: `p${i}`, sourceIndex: i + 1 }));
    const result = adapter.validateInput("rodin-i3d", photos);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toMatch(/between 1 and 5/);
  });

  it("rejects tripo photos missing a view slot", () => {
    const result = adapter.validateInput("tripo-mv3d", [
      { photoId: "a", sourceIndex: 4, viewSlot: "front" },
      { photoId: "b", sourceIndex: 2 },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/missing a required view slot/);
  });

  it("rejects duplicate tripo view slots", () => {
    const result = adapter.validateInput("tripo-mv3d", [
      { photoId: "a", sourceIndex: 4, viewSlot: "front" },
      { photoId: "b", sourceIndex: 2, viewSlot: "front" },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.join(" ")).toMatch(/assigned to more than one photo/);
  });

  it("accepts a 2-photo tripo submission (front+left), matching the real 2026-09-17 test", () => {
    const result = adapter.validateInput("tripo-mv3d", [
      { photoId: "a", sourceIndex: 4, viewSlot: "front" },
      { photoId: "b", sourceIndex: 2, viewSlot: "left" },
    ]);
    expect(result.valid).toBe(true);
  });

  it("rejects an unknown capability", () => {
    const result = adapter.validateInput("worldgen-mystery", [{ photoId: "a", sourceIndex: 1 }]);
    expect(result.valid).toBe(false);
  });
});

describe("LivepeerAdapter.submit", () => {
  it("uploads photos in tripo's required view order and calls run_capability with async:true", async () => {
    const mcp = fakeMcp({
      upload: (args) => ({ url: `https://agent.livepeer.org/a/${args.filename}` }),
      run_capability: () => ({ job_id: "mjob_new", status: "submitted", capability_used: "tripo-mv3d" }),
    });
    const adapter = new LivepeerAdapter(mcp, fakePhotos());

    const result = await adapter.submit({
      capability: "tripo-mv3d",
      idempotencyKey: "idem-1",
      photos: [
        { photoId: "right-photo", sourceIndex: 3, viewSlot: "right" },
        { photoId: "front-photo", sourceIndex: 4, viewSlot: "front" },
      ],
    });

    expect(result).toEqual({ providerJobId: "mjob_new", capabilityUsed: "tripo-mv3d", fallbackFired: null });

    const uploadCalls = mcp.calls.filter((c) => c.name === "upload");
    // front must be uploaded (and therefore appear in image_urls) before
    // right, even though the caller passed right first.
    expect(uploadCalls[0]?.args.filename).toBe("front-photo.jpg");
    expect(uploadCalls[1]?.args.filename).toBe("right-photo.jpg");

    const runCall = mcp.calls.find((c) => c.name === "run_capability");
    expect(runCall?.args.async).toBe(true);
    expect(runCall?.args.idempotency_key).toBe("idem-1");
    const inputs = runCall?.args.inputs as { image_urls: string[] };
    expect(inputs.image_urls).toEqual([
      "https://agent.livepeer.org/a/front-photo.jpg",
      "https://agent.livepeer.org/a/right-photo.jpg",
    ]);
    expect(inputs).toMatchObject({
      model_seed: 1_979_602_288,
      texture_seed: 2_109_681_439,
    });
  });

  it("keeps the deterministic Rodin seed within fal's documented 0-65535 range", async () => {
    const mcp = fakeMcp({
      upload: () => ({ url: "https://agent.livepeer.org/a/x.jpg" }),
      run_capability: () => ({ job_id: "mjob_new", status: "submitted", capability_used: "rodin-i3d" }),
    });
    const adapter = new LivepeerAdapter(mcp, fakePhotos());

    await adapter.submit({
      capability: "rodin-i3d",
      // This exact live-smoke key previously produced the rejected
      // int32 seed 463045388.
      idempotencyKey: "objectquest-smoke-20260918-rodin-01",
      photos: [{ photoId: "a", sourceIndex: 1 }],
    });

    const runCall = mcp.calls.find((call) => call.name === "run_capability");
    const inputs = runCall?.args.inputs as { seed: number };
    expect(inputs.seed).toBe(33_548);
    expect(inputs.seed).toBeGreaterThanOrEqual(0);
    expect(inputs.seed).toBeLessThanOrEqual(65_535);
  });

  it("throws McpTransportError when run_capability returns no job_id", async () => {
    const mcp = fakeMcp({
      upload: () => ({ url: "https://agent.livepeer.org/a/x.jpg" }),
      run_capability: () => ({ status: "queued" }),
    });
    const adapter = new LivepeerAdapter(mcp, fakePhotos());
    await expect(
      adapter.submit({ capability: "rodin-i3d", idempotencyKey: "k", photos: [{ photoId: "a", sourceIndex: 1 }] }),
    ).rejects.toBeInstanceOf(McpTransportError);
  });

  it("rejects before calling the provider when input validation fails", async () => {
    const mcp = fakeMcp({});
    const adapter = new LivepeerAdapter(mcp, fakePhotos());
    await expect(
      adapter.submit({ capability: "tripo-mv3d", idempotencyKey: "k", photos: [{ photoId: "a", sourceIndex: 1 }] }),
    ).rejects.toBeInstanceOf(McpToolError);
    expect(mcp.calls).toHaveLength(0);
  });

  it("reuses cached image URLs on a second submit for the same idempotency key instead of re-uploading", async () => {
    const mcp = fakeMcp({
      upload: (args) => ({ url: `https://agent.livepeer.org/a/${Date.now()}-${args.filename}` }),
      run_capability: () => ({ job_id: "mjob_new", status: "submitted", capability_used: "rodin-i3d" }),
    });
    const cacheStore = new Map<string, string[]>();
    const uploadCache = {
      get: vi.fn(async (key: string) => cacheStore.get(key)),
      set: vi.fn(async (key: string, urls: string[]) => {
        cacheStore.set(key, urls);
      }),
    };
    const adapter = new LivepeerAdapter(mcp, fakePhotos(), uploadCache);
    const request = { capability: "rodin-i3d", idempotencyKey: "idem-retry", photos: [{ photoId: "a", sourceIndex: 1 }] } as const;

    await adapter.submit(request);
    const firstUploadCount = mcp.calls.filter((c) => c.name === "upload").length;
    expect(firstUploadCount).toBe(1);

    await adapter.submit(request); // simulates a retry/resubmit reusing the same idempotencyKey
    const secondUploadCount = mcp.calls.filter((c) => c.name === "upload").length;
    expect(secondUploadCount).toBe(1); // no second upload — cached URL reused

    const runCalls = mcp.calls.filter((c) => c.name === "run_capability");
    const firstInputs = runCalls[0]?.args.inputs as { image_urls: string[] };
    const secondInputs = runCalls[1]?.args.inputs as { image_urls: string[] };
    expect(secondInputs.image_urls).toEqual(firstInputs.image_urls); // byte-identical request on retry
  });
});

describe("LivepeerAdapter.getStatus", () => {
  it("maps the actual done envelope to ready and resolves its capability's live registered model", async () => {
    const mcp = fakeMcp({
      get_create_media: () => RODIN_DONE_FIXTURE,
      describe_capability: (args) => ({
        name: args.name,
        found: true,
        availability: "available",
        status: "active",
        model_id: "fal-ai/hyper3d/rodin/v2.5",
      }),
    });
    const adapter = new LivepeerAdapter(mcp, fakePhotos());
    const status = await adapter.getStatus("mjob_cfb2286bf2b5");
    expect(status.state).toBe("ready");
    expect(status.resultAssetUrl).toBe(RODIN_DONE_FIXTURE.url);
    expect(status.actualRegisteredModel).toBe("fal-ai/hyper3d/rodin/v2.5");
    expect(status.actualFallbackFired).toBeNull();
    expect(mcp.calls.find((call) => call.name === "describe_capability")?.args).toEqual({ name: "rodin-i3d" });
  });

  it("leaves the model absent instead of guessing when live capability evidence is unavailable", async () => {
    const mcp = fakeMcp({
      get_create_media: () => RODIN_DONE_FIXTURE,
      describe_capability: () => ({ found: false }),
    });
    const status = await new LivepeerAdapter(mcp, fakePhotos()).getStatus("mjob_cfb2286bf2b5");
    expect(status.state).toBe("ready");
    expect(status.actualRegisteredModel).toBeUndefined();
  });

  it("maps a running response to generating with unknown progress", async () => {
    const mcp = fakeMcp({ get_create_media: () => TRIPO_RUNNING_FIXTURE });
    const adapter = new LivepeerAdapter(mcp, fakePhotos());
    const status = await adapter.getStatus("mjob_c91e623855ae");
    expect(status.state).toBe("generating");
    expect(status.progress.known).toBe(false);
    expect(status.resultAssetUrl).toBeUndefined();
  });

  it("maps a failed response to failed with a retryable error", async () => {
    const mcp = fakeMcp({ get_create_media: () => FAILED_FIXTURE });
    const adapter = new LivepeerAdapter(mcp, fakePhotos());
    const status = await adapter.getStatus("mjob_deadbeef0000");
    expect(status.state).toBe("failed");
    expect(status.error?.retryable).toBe(true);
    expect(status.error?.message).toBe("Upstream provider timed out");
  });
});

describe("LivepeerAdapter.discoverCapabilities", () => {
  it("returns only capabilities confirmed available via a live describe_capability call", async () => {
    const mcp = fakeMcp({
      describe_capability: (args) => ({
        found: true,
        availability: "available",
        status: "active",
        model_id: args.name === "rodin-i3d" ? "fal-ai/hyper3d/rodin/v2.5" : "tripo3d/h3.1/multiview-to-3d",
        fallback_chain: args.name === "rodin-i3d" ? ["tripo-i3d", "triposplat"] : null,
      }),
    });
    const adapter = new LivepeerAdapter(mcp, fakePhotos());
    const descriptors = await adapter.discoverCapabilities();
    expect(descriptors.map((d) => d.id).sort()).toEqual(["rodin-i3d", "tripo-mv3d"]);
    expect(descriptors.every((d) => d.notes?.includes("Confirmed available"))).toBe(true);
  });

  it("drops a capability the provider reports as degraded rather than returning it as usable", async () => {
    const mcp = fakeMcp({
      describe_capability: (args) => ({
        found: true,
        availability: args.name === "rodin-i3d" ? "available" : "unavailable",
        status: args.name === "rodin-i3d" ? "active" : "disabled",
        model_id: "whatever",
      }),
    });
    const adapter = new LivepeerAdapter(mcp, fakePhotos());
    const descriptors = await adapter.discoverCapabilities();
    expect(descriptors.map((d) => d.id)).toEqual(["rodin-i3d"]);
  });

  it("throws (does not silently return static descriptors) when no capability can be confirmed", async () => {
    const mcp = fakeMcp({
      describe_capability: () => {
        throw new McpTransportError("network unreachable");
      },
    });
    const adapter = new LivepeerAdapter(mcp, fakePhotos());
    await expect(adapter.discoverCapabilities()).rejects.toBeInstanceOf(McpTransportError);
  });
});
