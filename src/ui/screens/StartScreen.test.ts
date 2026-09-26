import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StartScreen } from "./StartScreen.js";

const noop = () => {};

describe("StartScreen hero", () => {
  const html = renderToStaticMarkup(createElement(StartScreen, {
    onPlaySample: noop, onEditSample: noop, onCreateFromPhotos: noop,
    signedIn: false, authMode: "stub", onSignIn: noop, onOpenDashboard: noop,
  }));

  it("keeps one h1, labelled for the hero section, named after the first pair", () => {
    expect(html.match(/<h1\b/g)).toHaveLength(1);
    expect(html).toMatch(/<h1 id="welcome-heading" class="wk-typing">/);
    expect(html).toContain('aria-labelledby="welcome-heading"');
    expect(html).toContain('<span class="oq-kit-sr-only">Your sofa is a mountain range.</span>');
  });

  it("renders the typed headline with the sofa and the mountain range first", () => {
    expect(html).toContain('<span class="wk-typing__word">sofa</span>');
    expect(html).toContain('<span class="wk-typing__word">mountain range</span>');
  });
});
