import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ADVENTURE_COPY, ADVENTURE_OPTIONS, AdventureControls, AdventureControlsView, LOOK_LABELS, THEME_OPTIONS,
  type AdventureControlsProps,
} from "./AdventureControls.js";
import { BIOME_IDS } from "../../biome/presets.js";

type ViewProps = Parameters<typeof AdventureControlsView>[0];

function baseProps(overrides: Partial<ViewProps> = {}): ViewProps {
  return {
    biomeId: "original",
    template: "restore-portal",
    quality: "standard",
    busy: false,
    error: null,
    onBiomeChange: vi.fn(),
    onTemplateChange: vi.fn(),
    onQualityChange: vi.fn(),
    onNewAdventure: vi.fn(),
    idPrefix: "t",
    confirming: false,
    onConfirmingChange: vi.fn(),
    ...overrides,
  };
}

/** The view has no hooks, so calling it yields the full host-element tree. */
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement(node)) return [];
  const element = node as ReactElement<Record<string, unknown>>;
  return [element, ...elements(element.props.children as ReactNode)];
}

function tree(props: ViewProps) {
  return elements(AdventureControlsView(props));
}

function radio(props: ViewProps, value: string) {
  const found = tree(props).find((el) => el.type === "input" && el.props.type === "radio" && el.props.value === value);
  if (!found) throw new Error(`No radio ${value}`);
  return found;
}

function buttonByText(props: ViewProps, text: string) {
  const found = tree(props).find((el) => el.type === "button" && el.props.children === text);
  if (!found) throw new Error(`No button ${text}`);
  return found;
}

function html(props: Partial<AdventureControlsProps> = {}) {
  const { idPrefix: _i, confirming: _c, onConfirmingChange: _o, ...rest } = baseProps();
  return renderToStaticMarkup(createElement(AdventureControls, { ...rest, ...props }));
}

describe("AdventureControls", () => {
  it("offers all six looks in the shared biome order, with Original first, and both adventures", () => {
    expect(THEME_OPTIONS.map((o) => [o.value, o.label])).toEqual([
      ["original", "Original"], ["tropical", "Tropical Island"], ["desert", "Desert"],
      ["alpine", "Snowy Alpine"], ["autumn", "Autumn Forest"], ["ember", "Volcanic Ember"],
    ]);
    expect(THEME_OPTIONS.map((o) => o.value)).toEqual([...BIOME_IDS]);
    expect(ADVENTURE_OPTIONS.map((o) => o.value)).toEqual(["restore-portal", "reach-beacon"]);
    const markup = html({ biomeId: "desert", template: "reach-beacon" });
    const checked = [...markup.matchAll(/<input type="radio"[^>]*checked=""[^>]*value="([^"]+)"/g)].map((m) => m[1]);
    expect(checked).toEqual(["desert", "reach-beacon"]);
  });

  it("names every look id, so a future look appears with a proper label", () => {
    for (const id of BIOME_IDS) {
      const entry = LOOK_LABELS[id];
      expect(entry, id).toBeDefined();
      expect(entry.value).toBe(id);
      expect(entry.label.trim().length, id).toBeGreaterThan(0);
      expect(entry.description.trim().length, id).toBeGreaterThan(0);
      // Only Original is the photo itself; every other look shows its palette.
      if (id === "original") expect(entry.swatch).toBeNull();
      else expect(Object.values(entry.swatch ?? {}).every((c) => /^#[0-9a-f]{6}$/i.test(c)), id).toBe(true);
    }
  });

  it("renders the looks as one labelled radio group with a tile per look", () => {
    const markup = html({ biomeId: "ember" });
    expect(markup).toMatch(/<div class="oq-adventure__looks" role="radiogroup" aria-labelledby="[^"]+-theme-legend">/);
    for (const id of BIOME_IDS) expect(markup).toContain(`data-theme="${id}"`);
    const lookRadios = [...markup.matchAll(/<input type="radio" name="([^"]+)"[^>]*value="(original|tropical|desert|alpine|autumn|ember)"/g)];
    expect(lookRadios).toHaveLength(BIOME_IDS.length);
    expect(new Set(lookRadios.map((m) => m[1])).size).toBe(1);
    expect(markup).toContain(ADVENTURE_COPY.themeHint);
  });

  it("changing the look only calls onBiomeChange and never starts a new adventure", () => {
    const props = baseProps();
    (radio(props, "tropical").props.onChange as () => void)();
    expect(props.onBiomeChange).toHaveBeenCalledWith("tropical");
    expect(props.onNewAdventure).not.toHaveBeenCalled();
    expect(props.onTemplateChange).not.toHaveBeenCalled();
  });

  it("choosing an adventure only records it for the next reset", () => {
    const props = baseProps();
    (radio(props, "reach-beacon").props.onChange as () => void)();
    expect(props.onTemplateChange).toHaveBeenCalledWith("reach-beacon");
    expect(props.onNewAdventure).not.toHaveBeenCalled();
  });

  it("maps the effects checkbox to quality", () => {
    const props = baseProps();
    const box = tree(props).find((el) => el.type === "input" && el.props.type === "checkbox")!;
    expect(box.props.checked).toBe(false);
    (box.props.onChange as (e: unknown) => void)({ currentTarget: { checked: true } });
    expect(props.onQualityChange).toHaveBeenCalledWith("reduced");
    (box.props.onChange as (e: unknown) => void)({ currentTarget: { checked: false } });
    expect(props.onQualityChange).toHaveBeenLastCalledWith("standard");
  });

  it("asks before resetting, and only resets on explicit confirmation", () => {
    const props = baseProps();
    (buttonByText(props, ADVENTURE_COPY.newAdventure).props.onClick as () => void)();
    expect(props.onConfirmingChange).toHaveBeenCalledWith(true);
    expect(props.onNewAdventure).not.toHaveBeenCalled();

    const confirming = baseProps({ confirming: true });
    (buttonByText(confirming, ADVENTURE_COPY.cancel).props.onClick as () => void)();
    expect(confirming.onNewAdventure).not.toHaveBeenCalled();
    (buttonByText(confirming, ADVENTURE_COPY.confirm).props.onClick as () => void)();
    expect(confirming.onNewAdventure).toHaveBeenCalledTimes(1);
    expect(confirming.onConfirmingChange).toHaveBeenCalledWith(false);
  });

  it("can skip confirmation where there is no progress to lose", () => {
    const props = baseProps({ confirmReset: false });
    (buttonByText(props, ADVENTURE_COPY.newAdventure).props.onClick as () => void)();
    expect(props.onNewAdventure).toHaveBeenCalledTimes(1);
  });

  it("can hide the new-adventure section while keeping the look choice", () => {
    const markup = html({ newAdventureAvailable: false });
    expect(markup).not.toContain(ADVENTURE_COPY.newAdventure);
    expect(markup).not.toContain('value="reach-beacon"');
    expect(markup).toContain('value="desert"');
  });

  it("locks every control and announces progress while busy", () => {
    const markup = html({ busy: true });
    expect(markup).toContain('role="status"');
    expect(markup).toContain(ADVENTURE_COPY.busy);
    expect(markup).toContain('aria-busy="true"');
    expect(markup.match(/<fieldset[^>]*disabled=""/g)).toHaveLength(2);
    expect(markup).toMatch(/<input type="checkbox"[^>]*disabled=""/);
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Start new adventure/);

    const props = baseProps({ busy: true });
    (radio(props, "desert").props.onChange as () => void)();
    (buttonByText(props, ADVENTURE_COPY.newAdventure).props.onClick as () => void)();
    expect(props.onBiomeChange).not.toHaveBeenCalled();
    expect(props.onConfirmingChange).not.toHaveBeenCalled();
    expect(props.onNewAdventure).not.toHaveBeenCalled();
  });

  it("honours disabled the same way", () => {
    const props = baseProps({ disabled: true });
    (radio(props, "desert").props.onChange as () => void)();
    (radio(props, "reach-beacon").props.onChange as () => void)();
    expect(props.onBiomeChange).not.toHaveBeenCalled();
    expect(props.onTemplateChange).not.toHaveBeenCalled();
  });

  it("does not report a change when the current option is re-selected", () => {
    const props = baseProps({ biomeId: "desert" });
    (radio(props, "desert").props.onChange as () => void)();
    expect(props.onBiomeChange).not.toHaveBeenCalled();
  });

  it("shows a failure as an alert and reassures that the world was kept", () => {
    const markup = html({ error: "We couldn't prepare that look. Try again." });
    expect(markup).toContain('role="alert"');
    expect(markup).toContain("We couldn&#x27;t prepare that look. Try again.");
    expect(markup).toContain(ADVENTURE_COPY.errorKept);
    expect(html({ error: "x", busy: true })).not.toContain('role="alert"');
  });

  it("keeps implementation terms out of player-facing copy", () => {
    const text = renderToStaticMarkup(createElement(AdventureControls, { ...baseProps(), confirmReset: true }))
      .replace(/<[^>]+>/g, " ");
    const allCopy = [text, ...Object.values(ADVENTURE_COPY),
      ...THEME_OPTIONS.flatMap((o) => [o.label, o.description]),
      ...ADVENTURE_OPTIONS.flatMap((o) => [o.label, o.description])].join(" ");
    expect(allCopy).not.toMatch(/\b(biome|seed|template|model|mesh|layout|quality|procedural|manifest|AI)\b/i);
  });

  it("gives each group an accessible name and unique radio names per instance", () => {
    const a = html();
    expect(a).toMatch(/<section class="oq-adventure" aria-labelledby="[^"]+"/);
    expect(a.match(/<legend/g)).toHaveLength(2);
    const names = new Set([...a.matchAll(/type="radio" name="([^"]+)"/g)].map((m) => m[1]));
    expect(names.size).toBe(2);
  });
});
