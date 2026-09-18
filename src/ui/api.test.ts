import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, describeApiError, exportLevelBundle, importLevelBundle } from "./api.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("describeApiError", () => {
  it("uses the ApiError message for a failed request", () => {
    const error = new ApiError("Photo upload failed.", 400, null);
    expect(describeApiError(error)).toBe("Photo upload failed.");
  });

  it("falls back to a generic message for unknown throwables", () => {
    expect(describeApiError("boom")).toBe("Something went wrong. Please try again.");
    expect(describeApiError(null)).toBe("Something went wrong. Please try again.");
  });

  it("uses a plain Error's message", () => {
    expect(describeApiError(new Error("network down"))).toBe("network down");
  });
});

describe("portable level bundle API", () => {
  it("imports the raw bundle through the large-body endpoint", async () => {
    const imported = { levelId: "imported-level", name: "Imported" };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(imported), {
        status: 201,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const file = { text: vi.fn().mockResolvedValue('{"bundleVersion":1}') } as unknown as File;

    await expect(importLevelBundle(file)).resolves.toMatchObject(imported);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/levels/import",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: '{"bundleVersion":1}',
      }),
    );
  });

  it("requests a complete export for the encoded level id", async () => {
    const bundle = { bundleVersion: 1, manifest: {}, assets: [], photos: [] };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(bundle), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(exportLevelBundle("level / one")).resolves.toEqual(bundle);
    expect(fetchMock).toHaveBeenCalledWith("/api/levels/level%20%2F%20one/export", undefined);
  });
});
