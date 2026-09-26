import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { headlineLabel, TypingHeadline } from "./TypingHeadline.js";
import { HEADLINE_PAIRS } from "./typingCycle.js";

const html = renderToStaticMarkup(createElement(TypingHeadline, { id: "welcome-heading" }));

describe("TypingHeadline first render", () => {
  it("names the heading with one stable sentence", () => {
    expect(headlineLabel()).toBe("Your sofa is a mountain range.");
    expect(html).toContain('<span class="oq-kit-sr-only">Your sofa is a mountain range.</span>');
  });

  it("hides the typed copy from assistive tech and never announces it", () => {
    expect(html).toMatch(/<span class="wk-typing__lines" aria-hidden="true">/);
    expect(html).not.toContain("aria-live");
  });

  it("shows the first pair whole, with no caret", () => {
    expect(html).toContain('<span class="wk-typing__word">sofa</span>');
    expect(html).toContain('<span class="wk-typing__word">mountain range</span>.');
    expect(html).not.toContain("data-caret");
  });

  it("stacks every word in its slot so the lines never change width", () => {
    for (const { object, landscape } of HEADLINE_PAIRS) {
      expect(html).toContain(`<span class="wk-typing__sizer">${object}</span>`);
      expect(html).toContain(`<span class="wk-typing__sizer">${landscape}.</span>`);
    }
  });

  it("offers the accent underline only when asked", () => {
    expect(html).not.toContain("wk-typing--underline");
    expect(renderToStaticMarkup(createElement(TypingHeadline, { underlineObject: true }))).toContain("wk-typing--underline");
  });
});
