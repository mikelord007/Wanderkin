/**
 * Deterministic, budget-bounded selection of what the biome layer draws from
 * a geometry-approved layout. The renderer never invents or moves a
 * placement; it only drops ones that are invalid or over budget.
 */
import { effectiveBudget } from "../presets.js";
import type {
  BiomeDefinition,
  BiomeLayout,
  BiomePropKind,
  BiomePropPlacement,
  BiomeSurfacePatch,
  EffectsQuality,
} from "../types.js";
import { PROP_UNIT_RADIUS } from "./propGeometry.js";

/** Uniform-array capacity of the scan surface blend; also a hard patch cap. */
export const MAX_SURFACE_PATCHES = 24;

/** xmur3 string hash feeding mulberry32: small, stable across platforms. */
export function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i += 1) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  let state = (h ^= h >>> 16) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const finite = (...values: number[]) => values.every((value) => Number.isFinite(value));

export function layoutExtent(layout: BiomeLayout): number {
  const { min, max } = layout.bounds;
  const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  return Number.isFinite(extent) && extent > 0 ? extent : 1;
}

export function layoutMatchesDefinition(definition: BiomeDefinition, layout: BiomeLayout | null): layout is BiomeLayout {
  return layout !== null && definition.id !== "original" && layout.biomeId === definition.id;
}

export interface SelectedProp {
  placement: BiomePropPlacement;
  /** World height actually drawn: the placement scale, shrunk only if the
   * prop's footprint would exceed the radius geometry cleared for it. */
  height: number;
}

export interface PropSelection {
  props: SelectedProp[];
  dropped: { invalid: number; kind: number; budget: number; clamped: number };
}

export function selectProps(definition: BiomeDefinition, layout: BiomeLayout, quality: EffectsQuality): PropSelection {
  const budget = effectiveBudget(definition, quality).props;
  const extent = layoutExtent(layout);
  const margin = extent * 0.05;
  const { min, max } = layout.bounds;
  const allowed = new Set<BiomePropKind>(definition.props.kinds);
  const dropped = { invalid: 0, kind: 0, budget: 0, clamped: 0 };
  const props: SelectedProp[] = [];
  const seen = new Set<string>();
  for (const placement of layout.props) {
    const { position: p, normal: n } = placement;
    const valid =
      finite(p[0], p[1], p[2], n[0], n[1], n[2], placement.scale, placement.yaw, placement.radius) &&
      placement.scale > 0 &&
      placement.radius > 0 &&
      placement.scale <= extent * 0.6 &&
      Math.hypot(n[0], n[1], n[2]) > 1e-6 &&
      p[0] >= min[0] - margin && p[0] <= max[0] + margin &&
      p[1] >= min[1] - margin && p[1] <= max[1] + margin &&
      p[2] >= min[2] - margin && p[2] <= max[2] + margin &&
      !seen.has(placement.id);
    if (!valid) {
      dropped.invalid += 1;
      continue;
    }
    seen.add(placement.id);
    if (!allowed.has(placement.kind)) {
      dropped.kind += 1;
      continue;
    }
    if (props.length >= budget) {
      dropped.budget += 1;
      continue;
    }
    const fit = placement.radius / PROP_UNIT_RADIUS[placement.kind];
    const height = Math.min(placement.scale, fit);
    if (height < placement.scale) dropped.clamped += 1;
    props.push({ placement, height });
  }
  return { props, dropped };
}

/**
 * The patches both the translucent support decals and the scan's cloned
 * materials use, so the two treatments always agree.
 */
export function selectSurfacePatches(
  definition: BiomeDefinition,
  layout: BiomeLayout | null,
  quality: EffectsQuality,
): BiomeSurfacePatch[] {
  if (!layoutMatchesDefinition(definition, layout)) return [];
  const valid = layout.patches
    .map((patch, index) => ({ patch, index }))
    .filter(({ patch: { position: p, normal: n, radius } }) =>
      finite(p[0], p[1], p[2], n[0], n[1], n[2], radius) && radius > 0 && Math.hypot(n[0], n[1], n[2]) > 1e-6);
  const coverage = Math.min(1, Math.max(0, definition.surface.patchCoverage));
  const byCoverage = valid.length === 0 ? 0 : Math.max(1, Math.round(valid.length * coverage));
  const limit = Math.min(byCoverage, effectiveBudget(definition, quality).patches, MAX_SURFACE_PATCHES);
  if (limit <= 0) return [];
  const random = seededRandom(`${layout.seed}:patches`);
  const shuffled = [...valid];
  for (let i = shuffled.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
  }
  return shuffled
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
    .map(({ patch }) => patch);
}
