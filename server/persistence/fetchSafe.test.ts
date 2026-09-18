import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async (hostname: string) => {
    if (hostname === "public.example.com") return [{ address: "93.184.216.34", family: 4 }];
    if (hostname === "internal.example.com") return [{ address: "10.0.0.5", family: 4 }];
    if (hostname === "metadata.example.com") return [{ address: "169.254.169.254", family: 4 }];
    throw Object.assign(new Error("not found"), { code: "ENOTFOUND" });
  }),
}));

const { assertSafeHttpsUrl, downloadBounded, UnsafeUrlError, DownloadTooLargeError } = await import("./fetchSafe.js");

describe("assertSafeHttpsUrl", () => {
  it("allows an https URL resolving to a public IP", async () => {
    await expect(assertSafeHttpsUrl("https://public.example.com/model.glb")).resolves.toBeInstanceOf(URL);
  });

  it("rejects plain http", async () => {
    await expect(assertSafeHttpsUrl("http://public.example.com/model.glb")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects a literal loopback IP", async () => {
    await expect(assertSafeHttpsUrl("https://127.0.0.1/model.glb")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects a hostname resolving to a private RFC1918 address", async () => {
    await expect(assertSafeHttpsUrl("https://internal.example.com/model.glb")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects a hostname resolving to the cloud metadata address", async () => {
    await expect(assertSafeHttpsUrl("https://metadata.example.com/")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects localhost by name", async () => {
    await expect(assertSafeHttpsUrl("https://localhost/model.glb")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("rejects an unresolvable hostname", async () => {
    await expect(assertSafeHttpsUrl("https://nowhere.example.com/model.glb")).rejects.toBeInstanceOf(UnsafeUrlError);
  });
});

describe("downloadBounded", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("follows a bounded chain of redirects to the final body", async () => {
    let hop = 0;
    const fetchMock = vi.fn(async (input: URL | string) => {
      const path = new URL(input).pathname;
      hop += 1;
      if (path === "/final") {
        return new Response("hello", { status: 200, headers: { "content-type": "model/gltf-binary" } });
      }
      const next = path === "/start" ? "/hop-2" : "/final";
      return new Response(null, { status: 302, headers: { location: `https://public.example.com${next}` } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await downloadBounded("https://public.example.com/start", 1024);
    expect(result.buffer.toString()).toBe("hello");
    expect(hop).toBe(3); // start -> hop-2 -> final
  });

  it("rejects a redirect loop with a bounded number of attempts instead of hanging forever", async () => {
    const fetchMock = vi.fn(
      async () => new Response(null, { status: 302, headers: { location: "https://public.example.com/loop" } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(downloadBounded("https://public.example.com/loop", 1024)).rejects.toBeInstanceOf(UnsafeUrlError);
    // MAX_REDIRECTS (5) initial hops followed by hops, refused on the 6th attempt — bounded, not infinite.
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(6);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(1);
  });

  it("rejects when the declared Content-Length exceeds the byte cap", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("x".repeat(2000), { status: 200, headers: { "content-type": "model/gltf-binary" } }),
      ),
    );
    await expect(downloadBounded("https://public.example.com/big.glb", 100)).rejects.toBeInstanceOf(
      DownloadTooLargeError,
    );
  });

  it("aborts and rejects when a length-less streamed body exceeds the byte cap", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(80));
        controller.enqueue(new Uint8Array(80));
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(stream, { status: 200 })), // no content-length for a stream body
    );
    await expect(downloadBounded("https://public.example.com/stream.glb", 100)).rejects.toBeInstanceOf(
      DownloadTooLargeError,
    );
  });
});
