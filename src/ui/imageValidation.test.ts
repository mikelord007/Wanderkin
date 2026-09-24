import { describe, expect, it } from "vitest";
import { signatureMatches, validateImageFile } from "./imageValidation.js";

function file(bytes: number[], type: string, name = "photo.jpg"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("image validation", () => {
  it("checks magic bytes instead of trusting the extension or MIME label", () => {
    expect(signatureMatches("image/jpeg", new Uint8Array([0xff, 0xd8, 0xff]))).toBe(true);
    expect(signatureMatches("image/jpeg", new Uint8Array([1, 2, 3]))).toBe(false);
    expect(signatureMatches("image/webp", new TextEncoder().encode("RIFFxxxxWEBP"))).toBe(true);
  });

  it("rejects invalid bytes before decoding", async () => {
    let decoded = false;
    await expect(validateImageFile(file([1, 2, 3], "image/jpeg"), async () => {
      decoded = true;
      return { width: 1000, height: 1000 };
    })).rejects.toThrow(/valid photo/i);
    expect(decoded).toBe(false);
  });

  it("uses decoded, orientation-aware dimensions and rejects excessive dimensions", async () => {
    const jpeg = file([0xff, 0xd8, 0xff, 0, 0, 0], "image/jpeg");
    await expect(validateImageFile(jpeg, async () => ({ width: 12_001, height: 800 })))
      .rejects.toThrow(/12,000/i);
  });
});
