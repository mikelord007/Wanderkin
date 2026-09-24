import { describe, expect, it } from "vitest";
import { assertImageDimensions, DecodeBudgetExceededError, ImageDecodeBudget } from "./imageDimensions.js";

function png(width: number, height: number): Buffer {
  const buffer = Buffer.alloc(512);
  buffer.set([137, 80, 78, 71, 13, 10, 26, 10]);
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

describe("image dimension protections", () => {
  it("rejects excessive decoded pixels from headers without decoding", () => {
    expect(() => assertImageDimensions(png(20_000, 20_000), { maxWidth: 12_000, maxHeight: 12_000, maxPixels: 40_000_000 }))
      .toThrow(/decoded-pixel limit/);
  });

  it("tracks and releases a process-wide RGBA decode reservation", () => {
    const budget = new ImageDecodeBudget(100);
    const release = budget.acquire(80);
    expect(() => budget.acquire(21)).toThrow(DecodeBudgetExceededError);
    release();
    expect(() => budget.acquire(100)).not.toThrow();
  });
});
