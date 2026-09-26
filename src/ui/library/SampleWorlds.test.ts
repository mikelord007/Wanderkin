import { isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SceneManifest } from "@shared/index.js";
import { Button } from "../components/index.js";
import { LANDING_WORLDS } from "../../game/landingWorlds.js";
import { SampleWorlds } from "./SampleWorlds.js";

/** The grid has no hooks, so calling it yields the full element tree. */
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  return [element, ...elements(element.props.children as ReactNode)];
}

function text(node: ReactNode): string {
  if (Array.isArray(node)) return node.map(text).join("");
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!isValidElement(node)) return "";
  return text((node.props as { children?: ReactNode }).children);
}

function grid(onPlaySample = vi.fn()) {
  const tree = elements(SampleWorlds({ samples: [...LANDING_WORLDS], error: null, onPlaySample, onCreateFromPhotos: vi.fn() }));
  return { tree, onPlaySample };
}

describe("the landing's sample cards", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("shows the Desk, Plane, Shoe and Car, the Desk featured", () => {
    const { tree } = grid();
    const cards = tree.filter((el) => el.type === "article");
    expect(cards).toHaveLength(4);
    expect(String(cards[0]!.props.className)).toContain("wk-world--featured");
    expect(tree.filter((el) => el.type === "h3").map((el) => text(el))).toEqual([
      "The Desk on the Beach", "Plane in the Snow", "Boot in the Rain", "Car in the Dunes",
    ]);
    expect(tree.filter((el) => el.type === "p" && el.props.className === "wk-world__meta").map((el) => text(el))).toEqual([
      "Wander 5 destinations, no timer · Tropical Island",
      "Wander 5 destinations, no timer · Snowy Alpine",
      "Wander 5 destinations, no timer · Monsoon Marsh",
      "Wander 5 destinations, no timer · Desert",
    ]);
  });

  it("uses each world's own card image, with a described scene", () => {
    const images = grid().tree.filter((el) => el.type === "img");
    expect(images.map((img) => img.props.src)).toEqual([
      "/samples/desk/card.webp", "/samples/plane/card.webp", "/samples/shoe/card.webp", "/samples/car/card.webp",
    ]);
    for (const img of images) expect(String(img.props.alt)).toMatch(/^In the game: the tiny explorer .{40,}/);
  });

  it("starts each world directly from its Play button, with no /api call", () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("no /api here")));
    vi.stubGlobal("fetch", fetchSpy);
    const { tree, onPlaySample } = grid();
    const plays = tree.filter((el) => el.type === Button && text(el).includes("Play now"));
    expect(plays).toHaveLength(4);
    for (const play of plays) (play.props.onClick as () => void)();
    const started = onPlaySample.mock.calls.map(([manifest]) => (manifest as SceneManifest).levelId);
    expect(started).toEqual(["sample-desk-beach", "sample-plane-snow", "sample-boot-rain", "sample-car-dunes"]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resolves each world's /play/ link from the bundle, with no /api call", async () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("no /api here")));
    vi.stubGlobal("fetch", fetchSpy);
    const { findBundledSample } = await import("../../App.js");
    for (const world of LANDING_WORLDS) expect(await findBundledSample(world.levelId)).toBe(world);
    // The older samples stay playable by their links, off the landing.
    expect((await findBundledSample("sample-lost-colors-rodin"))?.levelId).toBe("sample-lost-colors-rodin");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
