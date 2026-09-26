import { readFileSync, existsSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BRAND_BUNDLE_EXTENSION, BRAND_NAME, BRAND_SLUG } from "../../brand.js";
import { LOGO_SMALL_BELOW, Logo, LogoMark, MARK_BOX, TILE_FIT, type LogoTone } from "./Logo.js";

const root = new URL("../../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

function mark(size: number, tone: LogoTone = "full", title?: string): string {
  return renderToStaticMarkup(createElement(LogoMark, title ? { size, tone, title } : { size, tone }));
}

/** The drawing inside the `<svg>`, which is what the static copies must match. */
function drawing(size: number, tone: LogoTone = "full"): string {
  const svg = mark(size, tone);
  return svg.slice(svg.indexOf(">") + 1, svg.lastIndexOf("</svg>"));
}

describe("brand constants", () => {
  it("names the product Wanderkin and derives file stems from it", () => {
    expect(BRAND_NAME).toBe("Wanderkin");
    expect(BRAND_SLUG).toBe(BRAND_NAME.toLowerCase());
    expect(BRAND_SLUG).toMatch(/^[a-z0-9]+$/);
    expect(BRAND_BUNDLE_EXTENSION).toBe(`${BRAND_SLUG}.json`);
  });
});

describe("LogoMark", () => {
  it("draws the small optical cut below 24px and the full drawing from 24px", () => {
    expect(LOGO_SMALL_BELOW).toBe(24);
    for (const size of [16, 20, 23]) {
      expect(mark(size)).toContain('rx="11"');
      expect(mark(size)).not.toContain("stroke-width");
    }
    for (const size of [24, 36, 64]) {
      expect(mark(size)).toContain('rx="12"');
      expect(mark(size)).toContain("stroke-width");
    }
  });

  it("centres the drawing in its tile: equal clearance above and below, and either side", () => {
    for (const cut of ["full", "small"] as const) {
      const { scale, x, y } = TILE_FIT[cut];
      const box = MARK_BOX[cut];
      const top = y + scale * box.top;
      const bottom = 48 - (y + scale * box.bottom);
      const left = x + scale * box.left;
      const right = 48 - (x + scale * box.right);
      expect(Math.abs(top - bottom), cut).toBeLessThan(0.05);
      expect(Math.abs(left - right), cut).toBeLessThan(0.05);
      expect(top, cut).toBeGreaterThan(5);
    }
  });

  it("keeps mono to one colour and no tile", () => {
    for (const size of [16, 48]) {
      const svg = mark(size, "mono");
      expect(svg).not.toContain("<rect x=\"0\"");
      expect(svg.match(/#[0-9a-f]{6}/gi)).toBeNull();
      expect(svg).toContain('fill="currentColor"');
    }
  });

  it("is decorative unless given a title, then it is a named image", () => {
    expect(mark(36)).toContain('aria-hidden="true"');
    const named = mark(36, "full", "Home");
    expect(named).toContain('role="img"');
    expect(named).toContain('aria-label="Home"');
    expect(named).not.toContain("aria-hidden");
  });
});

describe("Logo", () => {
  it("gives assistive tech the plain name and hides the drawn dotless-i letters", () => {
    const html = renderToStaticMarkup(createElement(Logo, { size: 34 }));
    expect(html).toContain(`<span class="mh-logo__name">${BRAND_NAME}</span>`);
    const drawn = html.match(/<span class="mh-logo__drawn" aria-hidden="true">(.*?)<\/span><\/span>$/)?.[1] ?? "";
    const letters = drawn.replace(/<[^>]+>/g, "");
    expect(letters).toBe(BRAND_NAME.replace(/i(?!.*i)/, "ı"));
    expect(drawn).toContain('class="mh-logo__tittle"');
  });
});

describe("static brand files match the component", () => {
  it("public mark, favicon, and mono files are the component's drawings", () => {
    expect(read("public/brand/wanderkin-mark.svg")).toContain(drawing(48));
    expect(read("public/brand/wanderkin-favicon.svg")).toContain(drawing(16));
    expect(read("public/brand/wanderkin-mark-mono.svg")).toContain(drawing(48, "mono"));
  });

  it("index.html uses the small cut as favicon and inlines the full mark on the boot screen", () => {
    const html = read("index.html");
    const icon = html.match(/<link rel="icon" href="\/([^"]+)"/)?.[1];
    expect(icon).toBe("brand/wanderkin-favicon.svg");
    expect(existsSync(new URL(`public/${icon}`, root))).toBe(true);
    expect(html).toContain(drawing(64));
    expect(html).toContain(`<div class="mh-boot__word">${BRAND_NAME}</div>`);
    expect(html).toContain(`<title>${BRAND_NAME} `);
    expect(html).not.toMatch(/mousehold/i);
  });
});
