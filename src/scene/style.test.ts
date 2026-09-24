import { describe, expect, it } from "vitest";
import {
  clampColorRestoration,
  getSceneStyle,
  resolveEnvironmentDressing,
} from "./style.js";

describe("scene style definitions", () => {
  it("defines the complete shared field surface for Cartoon", () => {
    const style = getSceneStyle("cartoon");
    expect(style).toMatchObject({
      id: "cartoon",
      imagePrompt: expect.any(String),
      sceneColors: expect.any(Object),
      lighting: expect.any(Object),
      renderParameters: expect.any(Object),
      environmentDressing: expect.any(Object),
      audioPrompt: expect.any(String),
      interfaceAccent: expect.any(String),
    });
    expect(style.sceneColors.helperEdge).not.toBe(style.sceneColors.helperSurface);
  });

  it("clamps the progressive color restoration hook", () => {
    expect(clampColorRestoration(-0.2)).toBe(0);
    expect(clampColorRestoration(0.45)).toBe(0.45);
    expect(clampColorRestoration(2)).toBe(1);
    expect(clampColorRestoration(Number.NaN)).toBe(1);
  });

  it("maps optional atmosphere text without changing the style definition", () => {
    const style = getSceneStyle("cartoon");
    expect(resolveEnvironmentDressing(style, "An enchanted forest").motif).toBe("tree");
    expect(resolveEnvironmentDressing(style, "A sleepy seaside village").motif).toBe("reed");
    expect(style.environmentDressing.motif).toBe("cloud");
  });
});
