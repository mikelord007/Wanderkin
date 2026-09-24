import { STYLE_DEFINITIONS, type StyleId } from "../../shared/style.js";
import { describe, expect, it } from "vitest";
import {
  clampColorRestoration,
  getSceneStyle,
  resolveEnvironmentDressing,
} from "./style.js";

const STYLE_IDS: readonly StyleId[] = ["cartoon", "hand-painted", "watercolor"];

describe("scene style runtime", () => {
  it("consumes every canonical shared style definition", () => {
    for (const id of STYLE_IDS) {
      expect(getSceneStyle(id)).toBe(STYLE_DEFINITIONS[id]);
    }
  });

  it("keeps the three gameplay looks materially distinct", () => {
    const styles = STYLE_IDS.map(getSceneStyle);
    expect(new Set(styles.map((style) => style.sceneColors.background)).size).toBe(3);
    expect(new Set(styles.map((style) => style.render.watercolorWashStrength)).size).toBe(3);
    expect(styles.map((style) => style.render.outline.enabled)).toContain(true);
    expect(styles.map((style) => style.render.outline.enabled)).toContain(false);
  });

  it("clamps the progressive color restoration hook", () => {
    expect(clampColorRestoration(-0.2)).toBe(0);
    expect(clampColorRestoration(0.45)).toBe(0.45);
    expect(clampColorRestoration(2)).toBe(1);
    expect(clampColorRestoration(Number.NaN)).toBe(1);
  });

  it("maps optional atmosphere text without mutating the shared definition", () => {
    const style = getSceneStyle("cartoon");
    expect(resolveEnvironmentDressing(style, "An enchanted forest").motif).toBe("tree");
    expect(resolveEnvironmentDressing(style, "A sleepy seaside village").motif).toBe("reed");
    expect(style.environment.sky).toBe("gradient");
  });
});
