import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ADVENTURE_GENERATOR_VERSION, type MovementConfig, type SceneManifest } from "@shared/index.js";
import type { LoadedSceneAsset } from "../scene/runtime.js";
import type { AdventureTemplateId, BiomeDefinition, BiomeId, BiomeLayout, EffectsQuality } from "./types.js";
import { getBiomeDefinition } from "./presets.js";
import { prepareBiomeLayout } from "./placement.js";
import { prepareAdventure } from "./adventures.js";
import { acceptGeneratedAdventure } from "./adventureDraft.js";

export const THEME_FAILED_MESSAGE = "This look couldn’t be prepared for your world. Nothing changed — try another look.";
export const ADVENTURE_FAILED_MESSAGE = "We couldn’t find a safe new adventure here. Your current world is unchanged.";

/** Last look chosen per world, for this browser session only. It survives a
 * replay or a return from Finish but is never written to a saved world. */
const sessionLooks = new Map<string, { id: BiomeId; quality: EffectsQuality }>();
let sessionQuality: EffectsQuality = "standard";
const LAYOUT_CACHE_LIMIT = 6;

interface Presentation {
  id: BiomeId;
  quality: EffectsQuality;
  layout: BiomeLayout | null;
}

export interface BiomeAdventureState {
  /** What is currently rendered. */
  presented: Presentation;
  definition: BiomeDefinition;
  /** What the player picked; differs from `presented.id` only while preparing. */
  selectedId: BiomeId;
  selectedQuality: EffectsQuality;
  template: AdventureTemplateId;
  busy: boolean;
  error: string | null;
  setBiome: (id: BiomeId) => void;
  setQuality: (quality: EffectsQuality) => void;
  setTemplate: (template: AdventureTemplateId) => void;
  newAdventure: () => void;
  canStartNewAdventure: boolean;
}

/** Theme preparation lives outside the physics/session lifetime: a look
 * change never touches collision, objectives or progress. Work is committed
 * only on success; a failed or superseded attempt keeps what is on screen.
 * No persistence and no provider calls. */
export function useBiomeAdventure({ manifest, assets, movement, onAdventure }: {
  manifest: SceneManifest;
  assets: ReadonlyMap<string, LoadedSceneAsset> | null;
  /** The RUNTIME movement config; geometry recovers the authored one. */
  movement: MovementConfig | null;
  onAdventure: ((manifest: SceneManifest) => void) | undefined;
}): BiomeAdventureState {
  const initial = sessionLooks.get(manifest.levelId)
    ?? { id: manifest.biome?.id ?? "original", quality: sessionQuality };
  const [selected, setSelected] = useState(initial);
  const [presented, setPresented] = useState<Presentation>({ id: "original", quality: initial.quality, layout: null });
  const [template, setTemplate] = useState<AdventureTemplateId>(manifest.adventure?.template ?? "restore-portal");
  const [themeBusy, setThemeBusy] = useState(false);
  const [adventureBusy, setAdventureBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Decoration is seeded per world, not per switch, so a look is reproducible.
  const decorationSeed = manifest.biome?.seed ?? manifest.seed;
  const layoutCache = useRef(new Map<string, BiomeLayout>());
  const themeEpoch = useRef(0);
  const adventureEpoch = useRef(0);
  const manifestRef = useRef(manifest);
  manifestRef.current = manifest;

  // A different world (e.g. a freshly generated adventure) starts clean.
  useEffect(() => {
    layoutCache.current.clear();
    setTemplate(manifest.adventure?.template ?? "restore-portal");
  }, [manifest]);

  useEffect(() => {
    sessionLooks.set(manifest.levelId, selected);
    sessionQuality = selected.quality;
  }, [manifest.levelId, selected]);

  useEffect(() => {
    if (!assets || !movement) return;
    if (selected.id === presented.id && selected.quality === presented.quality
      && (selected.id === "original" || presented.layout !== null)) return;
    const token = ++themeEpoch.current;
    setThemeBusy(true);
    setError(null);
    // Yield so the preparing state paints before the bounded geometry work.
    const timer = setTimeout(() => {
      if (token !== themeEpoch.current) return;
      try {
        let layout: BiomeLayout | null = null;
        if (selected.id !== "original") {
          const key = `${selected.id}|${selected.quality}|${decorationSeed}`;
          const cached = layoutCache.current.get(key);
          if (cached) {
            layout = cached;
          } else {
            const prepared: BiomeLayout = prepareBiomeLayout({
              manifest: manifestRef.current, assets, movement,
              definition: getBiomeDefinition(selected.id), seed: decorationSeed, quality: selected.quality,
            });
            if (prepared.biomeId !== selected.id) throw new Error("Layout does not match the requested look.");
            layoutCache.current.set(key, prepared);
            if (layoutCache.current.size > LAYOUT_CACHE_LIMIT) {
              layoutCache.current.delete(layoutCache.current.keys().next().value!);
            }
            layout = prepared;
          }
        }
        setPresented({ id: selected.id, quality: selected.quality, layout });
      } catch (cause) {
        console.warn("[biome] look preparation failed", cause);
        setError(THEME_FAILED_MESSAGE);
        // Put the controls back on what is actually shown.
        setSelected((current) => current === selected ? { id: presented.id, quality: presented.quality } : current);
      } finally {
        setThemeBusy(false);
      }
    }, 30);
    return () => {
      clearTimeout(timer);
      if (token === themeEpoch.current) {
        themeEpoch.current += 1;
        setThemeBusy(false);
      }
    };
  }, [selected, presented, assets, movement, decorationSeed]);

  useEffect(() => () => {
    themeEpoch.current += 1;
    adventureEpoch.current += 1;
  }, []);

  const busy = themeBusy || adventureBusy;

  const newAdventure = useCallback(() => {
    if (!assets || !movement || !onAdventure || busy) return;
    const token = ++adventureEpoch.current;
    setAdventureBusy(true);
    setError(null);
    setTimeout(() => {
      if (token !== adventureEpoch.current) return;
      try {
        const source = manifestRef.current;
        const seed = `${source.seed.slice(0, 120)}:adventure:${crypto.randomUUID()}`;
        const result = prepareAdventure({ manifest: source, assets, movement, template, seed });
        if (!result.ok) {
          console.warn("[biome] adventure refused", result.reason, result.diagnostics);
          setError(ADVENTURE_FAILED_MESSAGE);
          return;
        }
        const accepted = acceptGeneratedAdventure(source, result.manifest, {
          template, seed, generator: ADVENTURE_GENERATOR_VERSION,
          biome: { id: presented.id, seed: decorationSeed },
          now: new Date().toISOString(), levelId: `adventure-${crypto.randomUUID()}`,
        });
        if (!accepted.ok) {
          console.warn("[biome] adventure rejected by integration checks", accepted.reason);
          setError(ADVENTURE_FAILED_MESSAGE);
          return;
        }
        sessionLooks.set(accepted.manifest.levelId, { id: presented.id, quality: presented.quality });
        onAdventure(accepted.manifest);
      } catch (cause) {
        console.warn("[biome] adventure preparation failed", cause);
        setError(ADVENTURE_FAILED_MESSAGE);
      } finally {
        if (token === adventureEpoch.current) setAdventureBusy(false);
      }
    }, 30);
  }, [assets, movement, onAdventure, busy, template, presented, decorationSeed]);

  const definition = useMemo(() => getBiomeDefinition(presented.id), [presented.id]);

  return {
    presented,
    definition,
    selectedId: selected.id,
    selectedQuality: selected.quality,
    template,
    busy,
    error,
    setBiome: useCallback((id: BiomeId) => setSelected((current) => current.id === id ? current : { ...current, id }), []),
    setQuality: useCallback((quality: EffectsQuality) => setSelected((current) => current.quality === quality ? current : { ...current, quality }), []),
    setTemplate,
    newAdventure,
    canStartNewAdventure: Boolean(onAdventure),
  };
}
