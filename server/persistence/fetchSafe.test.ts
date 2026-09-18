import { describe, expect, it, vi } from "vitest";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(async (hostname: string) => {
    if (hostname === "public.example.com") return [{ address: "93.184.216.34", family: 4 }];
    if (hostname === "internal.example.com") return [{ address: "10.0.0.5", family: 4 }];
    if (hostname === "metadata.example.com") return [{ address: "169.254.169.254", family: 4 }];
    throw Object.assign(new Error("not found"), { code: "ENOTFOUND" });
  }),
}));

const { assertSafeHttpsUrl, UnsafeUrlError } = await import("./fetchSafe.js");

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
