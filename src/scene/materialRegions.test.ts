import { describe, expect, it } from "vitest";
import { getKnownMaterialProfile } from "./materialRegions.js";

const RODIN_SHA256 = "c750cb2c1fcd2197f8c373b791703bc90073075e11d08cafb0be4d84012d54b8";

describe("getKnownMaterialProfile", () => {
  it("returns the authored profile for the exact known Rodin sample hash", () => {
    const profile = getKnownMaterialProfile(RODIN_SHA256);
    expect(profile).not.toBeNull();
    expect(profile?.dividerWorldX).toBe(-0.06);
    expect(profile?.blendWidth).toBeGreaterThan(0);
  });

  it("returns null for the Tripo sample and any other hash", () => {
    expect(getKnownMaterialProfile("e473288cd9e4b999aaf01631e228510ab24e114a2707eb718d3e5381c240cb64")).toBeNull();
    expect(getKnownMaterialProfile("not-a-real-hash")).toBeNull();
  });

  it("returns null for missing hashes instead of guessing", () => {
    expect(getKnownMaterialProfile(null)).toBeNull();
    expect(getKnownMaterialProfile(undefined)).toBeNull();
    expect(getKnownMaterialProfile("")).toBeNull();
  });
});
