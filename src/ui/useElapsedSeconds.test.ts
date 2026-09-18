import { describe, expect, it } from "vitest";
import { formatElapsed } from "./useElapsedSeconds.js";

describe("formatElapsed", () => {
  it("shows seconds only under a minute", () => {
    expect(formatElapsed(0)).toBe("0s");
    expect(formatElapsed(45)).toBe("45s");
  });

  it("shows minutes and zero-padded seconds at or above a minute", () => {
    expect(formatElapsed(60)).toBe("1m 00s");
    expect(formatElapsed(125)).toBe("2m 05s");
  });
});
