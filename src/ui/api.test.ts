import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  describeApiError,
  exportLevelBundle,
  getSharedLevel,
  importLevelBundle,
  publishLevel,
  safeBundleFilename,
} from "./api.js";
import { BRAND_SLUG } from "../brand.js";
import { installCredentialSource } from "../auth/credentials.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("publication API", () => {
  it("publishes privately by default and reads the stable share without generation calls", async () => {
    const publication = { versionId: "version-1", shareId: "share-1" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(publication), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(publication), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await publishLevel("level-1", { kind: "completion" });
    await getSharedLevel("share-1");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/levels/level-1/publish",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ challenge: { kind: "completion" }, includesSourcePhotos: false }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/shares/share-1", undefined);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/jobs"))).toBe(false);
  });
});

describe("safeBundleFilename", () => {
  it("names the download after the brand, and still ends in .json", () => {
    // The extension is cosmetic — the import route reads the body, never the
    // name — but a bundle that does not end in .json would fall outside the
    // file picker's accept list and look unopenable to the person who saved it.
    const name = safeBundleFilename("Room corner — Rodin");
    expect(name.startsWith("Room-corner-")).toBe(true);
    expect(name.endsWith(`.${BRAND_SLUG}.json`)).toBe(true);
  });

  it("falls back to a usable name when the level has none", () => {
    expect(safeBundleFilename("   ")).toBe(`${BRAND_SLUG}-level.${BRAND_SLUG}.json`);
  });

  it("strips path separators so a level name cannot steer where the file lands", () => {
    // Dots survive by design — they are legal in a filename, and without a
    // separator a run of them cannot traverse anywhere. It is the slashes and
    // backslashes that would let a level name choose a directory.
    const name = safeBundleFilename("../../etc/passwd");
    expect(name).not.toContain("/");
    expect(name).not.toContain("\\");
    expect(name.endsWith(`.${BRAND_SLUG}.json`)).toBe(true);
  });
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

describe("signed-in API calls", () => {
  afterEach(() => installCredentialSource(null));

  it("adds the active session's credential to every request without overriding explicit headers", async () => {
    installCredentialSource(async () => ({ Authorization: "Bearer session-token" }));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ shareId: "s" }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);

    await publishLevel("level-1", { kind: "completion" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(init.headers);
    expect(headers.get("authorization")).toBe("Bearer session-token");
    expect(headers.get("content-type")).toBe("application/json");
    expect(init.method).toBe("POST");
  });
});
