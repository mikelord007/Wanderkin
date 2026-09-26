/** React/R3F mount for {@link createBiomeLayer}. Renders nothing for Original. */
import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import type { PropCollider } from "../../game/core/propColliders.js";
import type { BiomeDefinition, BiomeLayout, EffectsQuality } from "../types.js";
import { createBiomeLayer } from "./decorLayer.js";

export interface BiomeLayerProps {
  definition: BiomeDefinition;
  layout: BiomeLayout | null;
  quality: EffectsQuality;
  reducedMotion: boolean;
  /** Receives the solid props drawn, then `[]` when they stop being drawn. */
  onColliders?: (colliders: readonly PropCollider[]) => void;
}

export function BiomeLayer({ definition, layout, quality, reducedMotion, onColliders }: BiomeLayerProps) {
  // Rebuilt only when what is drawn changes; reduced motion is a uniform flip.
  const handle = useMemo(
    () => createBiomeLayer({ definition, layout, quality, reducedMotion: false }),
    [definition, layout, quality],
  );
  useEffect(() => {
    handle.setReducedMotion(reducedMotion);
  }, [handle, reducedMotion]);
  useEffect(() => {
    handle.retain();
    return () => handle.dispose();
  }, [handle]);
  useEffect(() => {
    if (!onColliders) return undefined;
    onColliders(handle.colliders);
    return () => onColliders([]);
  }, [handle, onColliders]);
  useFrame((state, delta) => handle.update(state.clock.elapsedTime, delta, state.camera));

  if (handle.root.children.length === 0) return null;
  // dispose={null}: the handle owns every resource; R3F must not free the
  // shared prop material/geometries a second time on unmount.
  return <primitive object={handle.root} dispose={null} />;
}
