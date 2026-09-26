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

  it("shows the first pair whole, centred, with the caret after the landscape", () => {
    expect(html).toContain('<span class="wk-typing__line">Your <span class="wk-typing__slot wk-typing__slot--object"><span class="wk-typing__measure">sofa</span><span class="wk-typing__word">sofa</span></span><span class="wk-typing__caret"></span></span>');
    expect(html).toContain('<span class="wk-typing__word">mountain range</span></span><span class="wk-typing__caret" data-caret="blink"></span>.</span>');
    expect(html.match(/data-caret/g)).toHaveLength(1);
    expect(html).not.toContain("data-highlight");
  });

  it("sizes each slot from its current word only, not the longest word", () => {
    expect(html.match(/wk-typing__measure/g)).toHaveLength(2);
    expect(html).not.toContain("houseplant");
    expect(html).not.toContain("cliffside runway");
  });
});
