import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProgressPanel, Stepper, type ProgressStage } from "./Progress.js";
import { buildStageNote } from "../buildStageNotes.js";

const stages: ProgressStage[] = [
  { id: "object", label: "Preparing your object", status: "complete" },
  { id: "shape", label: "Building its 3D shape", status: "active" },
  { id: "course", label: "Creating your course", status: "pending" },
  { id: "sound", label: "Adding its sound", status: "error", detail: "Your world stays playable." },
];

const items = (html: string) => [...html.matchAll(/<li([^>]*)>(.*?)<\/li>/g)].map(([, attrs, body]) => ({ attrs: attrs!, body: body! }));

describe("Stepper", () => {
  it("puts every stage number in a circle: a check when done, ! when failed, the number otherwise", () => {
    const html = renderToStaticMarkup(createElement(Stepper, { stages }));
    const glyphs = [...html.matchAll(/oq-kit-stepper__glyph">([^<]*)</g)].map((m) => m[1]);
    expect(glyphs).toEqual(["✓", "2", "3", "!"]);
  });

  it("marks only the running stage as the current step, the one the spinner ring draws on", () => {
    const [done, running, waiting, failed] = items(renderToStaticMarkup(createElement(Stepper, { stages })));
    expect(running!.attrs).toContain('data-status="active"');
    expect(running!.attrs).toContain('aria-current="step"');
    for (const other of [done, waiting, failed]) expect(other!.attrs).not.toContain("aria-current");
  });

  it("says who is doing the work under the running stage, and keeps plain status elsewhere", () => {
    const html = renderToStaticMarkup(createElement(Stepper, { stages, activeNote: buildStageNote }));
    expect(html).toContain("Livepeer is building your 3D world now");
    expect(html).toContain(">Complete<");
    expect(html).toContain(">Waiting<");
    expect(html).toContain(">Needs attention<");
    expect(html).not.toContain(">In progress<");
  });

  it("falls back to 'In progress' without a note", () => {
    expect(renderToStaticMarkup(createElement(Stepper, { stages }))).toContain(">In progress<");
  });

  it("compact: circles only, each with its full meaning for screen readers", () => {
    const html = renderToStaticMarkup(createElement(Stepper, { stages, compact: true, activeNote: buildStageNote }));
    expect(html).toContain('class="oq-kit-stepper oq-kit-stepper--compact"');
    expect(html).not.toContain("<strong>");
    expect(html).toContain('aria-label="Building its 3D shape: Livepeer is building your 3D world now"');
    expect(html).toContain('aria-label="Preparing your object: Complete"');
  });

  it("the progress panel announces the running stage with its note", () => {
    const html = renderToStaticMarkup(createElement(ProgressPanel, { title: "Making your world", stages, activeNote: buildStageNote }));
    expect(html).toMatch(/role="status">Building its 3D shape: Livepeer is building your 3D world now\. Adding its sound: Needs attention</);
  });
});

describe("buildStageNote", () => {
  it("names Livepeer for the stages it runs, and says nothing for stages not running", () => {
    expect(buildStageNote({ id: "shape", label: "", status: "active" })).toBe("Livepeer is building your 3D world now");
    expect(buildStageNote({ id: "sound", label: "", status: "active" })).toBe("Livepeer is making its music");
    expect(buildStageNote({ id: "story", label: "", status: "active" })).toBeUndefined();
    expect(buildStageNote({ id: "shape", label: "", status: "complete" })).toBeUndefined();
    expect(buildStageNote({ id: "unknown", label: "", status: "active" })).toBeUndefined();
  });
});
