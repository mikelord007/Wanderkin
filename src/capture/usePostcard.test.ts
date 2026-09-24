import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { PostcardController } from "./usePostcard.js";
import { usePostcard } from "./usePostcard.js";

const api = vi.hoisted(() => ({
  getPostcardStatus: vi.fn(),
  retryAnimatedPostcard: vi.fn(),
  uploadWorldScreenshot: vi.fn(),
  createAnimatedPostcard: vi.fn(),
}));

vi.mock("../ui/api.js", () => api);

describe("usePostcard cost guard", () => {
  it("never uploads a screenshot or creates a fresh postcard while unavailable", async () => {
    let controller: PostcardController | undefined;
    function Probe() {
      controller = usePostcard("world-1", {
        blob: new Blob(["capture"], { type: "image/png" }),
        width: 1280,
        height: 720,
        mimeType: "image/png",
      });
      return null;
    }
    renderToStaticMarkup(createElement(Probe));

    expect(controller?.canCreate).toBe(false);
    await controller?.create();
    expect(api.uploadWorldScreenshot).not.toHaveBeenCalled();
    expect(api.createAnimatedPostcard).not.toHaveBeenCalled();
  });
});
