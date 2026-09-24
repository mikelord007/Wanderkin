import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { VideoAssetReference } from "@shared/index.js";
import { CompletionMediaCards } from "./MediaCards.js";

const common = {
  postcardState: "none" as const,
  postcardVideo: null,
  postcardError: null,
  canCreatePostcard: false,
  highlight: null,
  recordingSupported: true,
  recordingError: null,
};

describe("CompletionMediaCards", () => {
  it("shows the fail-closed postcard state without a create or retry control", () => {
    const html = renderToStaticMarkup(createElement(CompletionMediaCards, common));
    expect(html).toContain("Animated postcards are temporarily unavailable.");
    expect(html).not.toContain("Create animated postcard</button>");
    expect(html).not.toContain("Retry animated postcard</button>");
  });

  it("keeps an existing saved postcard playable and downloadable", () => {
    const video = {
      schemaVersion: 1,
      mediaType: "video",
      kind: "animated-postcard",
      id: "saved-video",
      url: "/api/generated-assets/files/saved.mp4",
      sha256: "6".repeat(64),
      sizeBytes: 1024,
      mimeType: "video/mp4",
      durationSeconds: 5,
      width: 1280,
      height: 720,
      source: "generated-animation",
      provenance: {
        providerId: "fixture",
        requestedCapability: "pixverse-i2v",
        servedCapability: "pixverse-i2v",
        servedModel: "fixture/pixverse",
        applicationJobId: "job-video",
        providerJobId: "provider-video",
        timings: { requestedAt: "2026-09-24T00:00:00.000Z", completedAt: "2026-09-24T00:00:05.000Z" },
        reportedCost: { amount: 0.34, currency: "USD" },
      },
    } satisfies VideoAssetReference;
    const html = renderToStaticMarkup(createElement(CompletionMediaCards, {
      ...common,
      postcardState: "ready",
      postcardVideo: video,
    }));
    expect(html).toContain("Generated animated postcard preview");
    expect(html).toContain("Download animated postcard");
    expect(html).toContain(video.url);
    expect(html).not.toContain("temporarily unavailable");
  });
});
