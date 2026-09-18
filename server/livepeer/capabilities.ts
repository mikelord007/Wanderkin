import type { ProviderCapabilityDescriptor } from "../../shared/provider.js";

/**
 * Static fallback/base descriptors. Values not discoverable from
 * `describe_capability` (min/max photos, required view order, scene-prompt
 * support) are sourced from docs/CONTRACTS.md and the reference workspace's
 * successful 2026-09-17 requests (`outputs/room-corner-comparison/
 * rodin-request.json`, `tripo-request.json`) — re-verify against
 * https://fal.ai/models/.../api if the provider schema changes.
 */
export const STATIC_CAPABILITY_DESCRIPTORS: readonly ProviderCapabilityDescriptor[] = [
  {
    id: "rodin-i3d",
    displayName: "Rodin (Hyper3D v2.5)",
    registeredModel: "fal-ai/hyper3d/rodin/v2.5",
    minPhotos: 1,
    maxPhotos: 5,
    supportsScenePrompt: true,
    supportsCancellation: false,
    supportsProgressPercent: false,
    notes:
      "Static fallback descriptor (live discovery unavailable). Accepts 1-5 photos in caller-chosen order; " +
      "fallback_chain observed live: tripo-i3d, triposplat.",
  },
  {
    id: "tripo-mv3d",
    displayName: "Tripo Multiview (h3.1)",
    registeredModel: "tripo3d/h3.1/multiview-to-3d",
    minPhotos: 2,
    maxPhotos: 4,
    requiredViewOrder: ["front", "left", "back", "right"],
    supportsScenePrompt: false,
    supportsCancellation: false,
    supportsProgressPercent: false,
    notes:
      "Static fallback descriptor (live discovery unavailable). Requires 2-4 photos each assigned a distinct " +
      "front/left/back/right view slot; no scene-guidance prompt input.",
  },
];

export function findStaticDescriptor(id: string): ProviderCapabilityDescriptor | undefined {
  return STATIC_CAPABILITY_DESCRIPTORS.find((d) => d.id === id);
}
