import { describe, expect, it } from "vitest";
import type { SceneManifest } from "@shared/index.js";
import { courseCandidateOptions, replaceSavedCandidate } from "./courseCandidates.js";

function candidate(levelId: string): SceneManifest {
  return { levelId } as SceneManifest;
}

describe("course candidate selection", () => {
  it("keeps the original primary available after an alternate is selected", () => {
    const primary = candidate("primary");
    const alternate = candidate("alternate");

    const options = courseCandidateOptions(primary, [alternate]);
    expect(options).toEqual([primary, alternate]);

    // Selection is deliberately not an input to option construction.
    const selected = alternate;
    expect(selected.levelId).toBe("alternate");
    expect(courseCandidateOptions(primary, [alternate])).toEqual([primary, alternate]);
  });

  it("replaces a saved candidate with the authoritative minted manifest", () => {
    const primary = candidate("primary");
    const alternate = candidate("alternate");
    const saved = candidate("minted-id");

    expect(replaceSavedCandidate([alternate], "alternate", saved)).toEqual([saved]);
    expect(courseCandidateOptions(primary, [saved])).toEqual([primary, saved]);
  });

  it("deduplicates a provider candidate that repeats the primary id", () => {
    const primary = candidate("primary");
    expect(courseCandidateOptions(primary, [candidate("primary"), candidate("alternate")])).toEqual([
      primary,
      expect.objectContaining({ levelId: "alternate" }),
    ]);
  });
});
