import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LoadingScreen } from "./LoadingScreen.js";

const styles = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");
const rule = (selector: string) => styles.match(new RegExp(`${selector.replace(/[.-]/g, (c) => `\\${c}`)}\\s*\\{([^}]*)\\}`))?.[1] ?? "";

describe("LoadingScreen placement", () => {
  it("the app's first loader (while sign-in settles) fills the page and sits in its middle, both ways", () => {
    // App renders <LoadingScreen stage="Loading…" /> straight under #root.
    expect(renderToStaticMarkup(createElement(LoadingScreen, { stage: "Loading…" }))).toMatch(/^<div class="oq-loading" role="status"/);
    const loading = rule(".oq-loading");
    for (const declaration of ["display: flex", "align-items: center", "justify-content: center", "width: 100%", "min-height: 100vh", "min-height: 100dvh"]) {
      expect(loading, declaration).toContain(declaration);
    }
  });

  it("inline placement fills its sized box instead of the page", () => {
    expect(renderToStaticMarkup(createElement(LoadingScreen, { stage: "Loading…", placement: "inline" }))).toContain('class="oq-loading oq-loading--inline"');
    expect(rule(".oq-loading--inline")).toContain("min-height: 0");
  });
});
