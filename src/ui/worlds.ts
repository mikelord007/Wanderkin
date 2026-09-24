import type { GenerationJob, SceneManifest } from "@shared/index.js";
import type { EditorDraft } from "../editor/draftStorage.js";

/** Shared My worlds boundary. Worker 4 can append pending/failed job items
 * without owning or duplicating the saved-level rendering rules. */
export type WorldListItem =
  | {
      kind: "saved";
      id: string;
      manifest: SceneManifest;
      draft: EditorDraft | null;
    }
  | {
      kind: "draft";
      id: string;
      draft: EditorDraft;
    }
  | {
      kind: "pending";
      id: string;
      title: string;
      job: GenerationJob;
      statusText?: string;
      actionLabel?: "Resume" | "View progress";
    }
  | {
      kind: "failed";
      id: string;
      title: string;
      job: GenerationJob;
      statusText?: string;
      actionLabel?: "Retry" | "Review choices";
    };

export function savedWorldItems(
  manifests: readonly SceneManifest[],
  drafts: readonly EditorDraft[],
): WorldListItem[] {
  const draftsByLevel = new Map(drafts.map((draft) => [draft.levelId, draft]));
  const saved = manifests.map((manifest): WorldListItem => ({
    kind: "saved",
    id: manifest.levelId,
    manifest,
    draft: draftsByLevel.get(manifest.levelId) ?? null,
  }));
  const unsaved = drafts
    .filter((draft) => !manifests.some((manifest) => manifest.levelId === draft.levelId))
    .map((draft): WorldListItem => ({ kind: "draft", id: draft.levelId, draft }));
  return [...unsaved, ...saved];
}

export function savedWorldOrigin(manifest: SceneManifest): "generated" | "sample-copy" | "imported" {
  if (manifest.assets.some((asset) => asset.generation || asset.provenance) || manifest.photos.length > 0) {
    return "generated";
  }
  if (manifest.assets.some((asset) => asset.url.startsWith("/samples/"))) return "sample-copy";
  return "imported";
}

export async function missingAssetUrls(
  manifest: SceneManifest,
  request: typeof fetch = fetch,
): Promise<string[]> {
  const checks = await Promise.all(
    manifest.assets.map(async (asset) => {
      try {
        const response = await request(asset.url, { method: "HEAD" });
        return response.ok ? null : asset.url;
      } catch {
        return asset.url;
      }
    }),
  );
  return checks.filter((url): url is string => url !== null);
}
