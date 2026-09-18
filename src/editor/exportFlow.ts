import type { SceneManifest } from "@shared/index.js";

interface SaveThenExportOptions {
  workingManifest: SceneManifest;
  needsSave: boolean;
  onSave: (manifest: SceneManifest) => SceneManifest | Promise<SceneManifest>;
  onPersisted: (manifest: SceneManifest) => void;
  onExport: (manifest: SceneManifest) => void | Promise<void>;
}

/**
 * Persists draft state before export and always exports the authoritative
 * server response. Creation may mint a different level id when the requested
 * id already exists, so the pre-save manifest is never safe to export.
 */
export async function saveThenExport({
  workingManifest,
  needsSave,
  onSave,
  onPersisted,
  onExport,
}: SaveThenExportOptions): Promise<SceneManifest> {
  const authoritative = needsSave ? await onSave(workingManifest) : workingManifest;
  if (needsSave) onPersisted(authoritative);
  await onExport(authoritative);
  return authoritative;
}
