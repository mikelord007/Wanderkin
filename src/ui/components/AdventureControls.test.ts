import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  ADVENTURE_COPY, ADVENTURE_OPTIONS, AdventureControls, AdventureControlsView,
  type AdventureControlsProps,
} from "./AdventureControls.js";
import { LOOK_LABELS } from "../../biome/lookCatalog.js";
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
  it("states the world's look, locked, and offers no way to change it", () => {
    for (const id of BIOME_IDS) {
      const markup = html({ biomeId: id });
      expect(markup).toContain(`${ADVENTURE_COPY.worldLabel}: ${LOOK_LABELS[id].label}`);
      expect(markup).toContain(ADVENTURE_COPY.worldLocked);
      expect(markup).toMatch(/<p class="oq-adventure__world" data-theme="[a-z]+"><svg[^>]*class="oq-adventure__world-lock"/);
      // No look radios at all: the only radios are the two adventures.
      const radios = [...markup.matchAll(/<input type="radio"[^>]*value="([^"]+)"/g)].map((m) => m[1]);
      expect(radios).toEqual(["restore-portal", "reach-beacon"]);
    }
  });

  it("never reports a look change, whatever the player does", () => {
    const props = baseProps({ biomeId: "monsoon" });
    for (const el of tree(props)) {
      for (const handler of ["onChange", "onClick"] as const) {
        const fn = el.props[handler];
        if (typeof fn === "function" && el.props.type !== "checkbox") (fn as (e?: unknown) => void)({ currentTarget: { checked: true } });
      }
    }
    expect(props.onBiomeChange).not.toHaveBeenCalled();
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

  it("can hide the new-adventure section while still naming the world", () => {
    const markup = html({ newAdventureAvailable: false, biomeId: "desert" });
    expect(markup).not.toContain(ADVENTURE_COPY.newAdventure);
    expect(markup).not.toContain('value="reach-beacon"');
    expect(markup).toContain("World: Desert");
  });

  it("locks every control and announces progress while busy", () => {
    const markup = html({ busy: true });
    expect(markup).toContain('role="status"');
    expect(markup).toContain(ADVENTURE_COPY.busy);
    expect(markup).toContain('aria-busy="true"');
    expect(markup.match(/<fieldset[^>]*disabled=""/g)).toHaveLength(1);
    expect(markup).toMatch(/<input type="checkbox"[^>]*disabled=""/);
    expect(markup).toMatch(/<button[^>]*disabled=""[^>]*>Start new adventure/);

    const props = baseProps({ busy: true });
    (radio(props, "reach-beacon").props.onChange as () => void)();
    (buttonByText(props, ADVENTURE_COPY.newAdventure).props.onClick as () => void)();
    expect(props.onTemplateChange).not.toHaveBeenCalled();
    expect(props.onConfirmingChange).not.toHaveBeenCalled();
    expect(props.onNewAdventure).not.toHaveBeenCalled();
  });

  it("honours disabled the same way", () => {
    const props = baseProps({ disabled: true });
    (radio(props, "reach-beacon").props.onChange as () => void)();
    expect(props.onTemplateChange).not.toHaveBeenCalled();
  });

  it("does not report a change when the current adventure is re-selected", () => {
    const props = baseProps({ template: "reach-beacon" });
    (radio(props, "reach-beacon").props.onChange as () => void)();
    expect(props.onTemplateChange).not.toHaveBeenCalled();
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
      ...Object.values(LOOK_LABELS).flatMap((o) => [o.label, o.description]),
      ...ADVENTURE_OPTIONS.flatMap((o) => [o.label, o.description])].join(" ");
    expect(allCopy).not.toMatch(/\b(biome|seed|template|model|mesh|layout|quality|procedural|manifest|AI)\b/i);
  });

  it("gives each group an accessible name and unique radio names per instance", () => {
    const a = html();
    expect(a).toMatch(/<section class="oq-adventure" aria-labelledby="[^"]+"/);
    expect(a.match(/<legend/g)).toHaveLength(1);
    const names = new Set([...a.matchAll(/type="radio" name="([^"]+)"/g)].map((m) => m[1]));
    expect(names.size).toBe(1);
  });
});
