import type { SceneManifest } from "@shared/index.js";

/**
 * Preserves in-progress editor edits across a reload without ever
 * silently overwriting a newer saved version of the same level. Keyed by
 * `levelId` (never a single global slot), and stamped with the
 * `updatedAt` of the manifest the draft was BASED off — not the draft's
 * own in-progress edits, which don't get a fresh `updatedAt` until an
 * actual Save (server-stamped, see server/levels.ts).
 *
 * If a reload finds a draft whose `baseUpdatedAt` no longer matches the
 * manifest just loaded from the server, that means the saved level moved
 * on since this draft was started (saved from another tab/device, or by
 * a teammate) — resuming it blind would silently clobber that newer data.
 * The caller must ask the user instead of auto-resuming in that case.
 */
export interface EditorDraft {
  levelId: string;
  baseUpdatedAt: string;
  manifest: SceneManifest;
  savedAt: string;
}

const DRAFT_KEY_PREFIX = "objectquest:editorDraft:";

function keyFor(levelId: string): string {
  return `${DRAFT_KEY_PREFIX}${levelId}`;
}

export function loadDraft(levelId: string): EditorDraft | null {
  try {
    const raw = localStorage.getItem(keyFor(levelId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as EditorDraft;
    if (parsed.levelId !== levelId || !parsed.manifest || !parsed.baseUpdatedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveDraft(draft: EditorDraft): void {
  try {
    localStorage.setItem(keyFor(draft.levelId), JSON.stringify(draft));
  } catch {
    // Storage unavailable (private browsing, quota) — editing still works
    // for this session, it just won't survive a reload.
  }
}

export function clearDraft(levelId: string): void {
  try {
    localStorage.removeItem(keyFor(levelId));
  } catch {
    // ignore
  }
}

/** Enumerates recoverable editor drafts for My worlds. Corrupt entries are
 * ignored individually so one bad localStorage value cannot hide the rest. */
export function listDrafts(): EditorDraft[] {
  try {
    const drafts: EditorDraft[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!key?.startsWith(DRAFT_KEY_PREFIX)) continue;
      const levelId = key.slice(DRAFT_KEY_PREFIX.length);
      const draft = loadDraft(levelId);
      if (draft) drafts.push(draft);
    }
    return drafts.sort((left, right) => right.savedAt.localeCompare(left.savedAt));
  } catch {
    return [];
  }
}

export type DraftResolution =
  | { kind: "none" }
  | { kind: "fresh"; draft: EditorDraft }
  | { kind: "stale"; draft: EditorDraft };

/** Pure decision used on editor mount. `"fresh"` means the draft's base
 * still matches the current saved manifest — safe to auto-resume.
 * `"stale"` means the saved data moved on since the draft started — the
 * caller must offer an explicit choice (resume anyway vs discard) rather
 * than picking for the user. */
export function resolveDraft(levelId: string, currentManifestUpdatedAt: string): DraftResolution {
  const draft = loadDraft(levelId);
  if (!draft) return { kind: "none" };
  if (draft.baseUpdatedAt === currentManifestUpdatedAt) return { kind: "fresh", draft };
  return { kind: "stale", draft };
}
