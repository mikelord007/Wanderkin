import { createElement, createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GRAPPLE_HINT_COPY, GRAPPLE_HINT_KEY, GrappleHint, GrappleReticle, claimGrappleHint } from "./GrappleReticle.js";

function memoryStore() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, values };
}

describe("grapple HUD", () => {
  it("shows the hint once per session, under the intro key prefix", () => {
    const store = memoryStore();
    expect(GRAPPLE_HINT_KEY.startsWith("objectquest:intro:")).toBe(true);
    expect(claimGrappleHint(store)).toBe(true);
    expect(claimGrappleHint(store)).toBe(false);
    expect(store.values.get(GRAPPLE_HINT_KEY)).toBe("seen");
    // No storage (or storage that throws) never shows it rather than nagging.
    expect(claimGrappleHint(null)).toBe(false);
    expect(claimGrappleHint({ getItem: () => { throw new Error("denied"); }, setItem: () => undefined })).toBe(false);
  });

  it("renders a two-line hint and a hidden, decorative reticle", () => {
    const hint = renderToStaticMarkup(createElement(GrappleHint));
    expect(hint).toContain(GRAPPLE_HINT_COPY.title);
    expect(hint).toContain(GRAPPLE_HINT_COPY.body);
    expect(`${GRAPPLE_HINT_COPY.title} ${GRAPPLE_HINT_COPY.body}`).toBe("Aim at a ledge, press F to hook");

    const reticle = renderToStaticMarkup(createElement(GrappleReticle, { reticleRef: createRef<HTMLDivElement>() }));
    expect(reticle).toContain('data-state="hidden"');
    expect(reticle).toContain('aria-hidden="true"');
  });
});
