import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { worldBuildStages, type PendingWorld } from "../pendingWorlds.js";
import { PendingWorldTile } from "./PendingWorldTile.js";

const START = "2026-09-26T09:00:00.000Z";
const NOW = new Date(START).getTime() + 3 * 60_000;

function world(overrides: Partial<PendingWorld>): PendingWorld {
  const stages = worldBuildStages(null, { state: "generating" });
  return {
    id: "w1", title: "Untitled world", style: "watercolor", mode: "collect", state: "building",
    photoUrl: "/photos/w1.jpg", shapeJobId: "shape-1", startedAt: START, stages, progress: 0.48, currentStage: stages[1]!,
    ...overrides,
  };
}

function render(props: Partial<Parameters<typeof PendingWorldTile>[0]> & { world: PendingWorld }) {
  return renderToStaticMarkup(createElement(PendingWorldTile, {
    now: NOW, onOpen: vi.fn(), onPlay: vi.fn(), onRetry: vi.fn(), onDiscard: vi.fn(), ...props,
  }));
}

describe("PendingWorldTile", () => {
  it("building: the photo, a progress strip, the stage and the time, and a way into the progress", () => {
    const html = render({ world: world({}) });
    expect(html).toContain('class="wk-tile wk-tile--openable" data-status="building"');
    expect(html).toContain('src="/photos/w1.jpg"');
    expect(html).toContain(">Building<");
    expect(html).toMatch(/role="progressbar"[^>]*aria-valuenow="48"/);
    expect(html).toContain('aria-valuetext="Building its 3D shape, step 2 of 4"');
    expect(html).toContain("Building its 3D shape");
    expect(html).toContain("Started 3 min ago");
    expect(html).toContain("Watercolor look · Collect");
    expect(html).toContain("View progress");
    expect(html).not.toContain(">Play<");
  });

  it("building: the same stage circles as the progress screen, with the running one named", () => {
    const html = render({ world: world({}) });
    expect(html).toContain('class="oq-kit-stepper oq-kit-stepper--compact"');
    expect(html).toMatch(/<li data-status="active" aria-current="step"/);
    expect(html).toContain("Livepeer is building your 3D world now");
  });

  it("done: the same tile as a saved world, with Play first", () => {
    const html = render({ world: world({ state: "done", progress: 1, previewUrl: "/preview.png", resultAssetId: "a1" }) });
    expect(html).toContain('data-status="ready"');
    expect(html).toContain('src="/preview.png"');
    expect(html).toContain("New world");
    expect(html).toMatch(/<button[^>]*class="[^"]*wk-tile__play[^"]*"[^>]*>.*Play<\/button>/);
    expect(html).not.toContain('role="progressbar"');
  });

  it("failed: the error, Retry and Discard", () => {
    const stages = worldBuildStages(null, { state: "failed" });
    const html = render({ world: world({ state: "failed", stages, currentStage: stages[1]!, error: "The 3D service timed out.", retryStage: "shape" }) });
    expect(html).toContain('data-status="failed"');
    expect(html).toContain("Needs attention");
    expect(html).toContain("Building its 3D shape didn’t finish. The 3D service timed out.");
    expect(html).toContain(">Retry<");
    expect(html).toContain(">Discard<");
    expect(html).not.toContain('role="progressbar"');
  });

  it("failed: shows a retry that itself failed", () => {
    const stages = worldBuildStages(null, { state: "failed" });
    const html = render({ world: world({ state: "failed", stages, currentStage: stages[1]!, retryStage: "shape" }), retryError: "Retry couldn’t start." });
    expect(html).toMatch(/role="alert">Retry couldn’t start\./);
  });
});
