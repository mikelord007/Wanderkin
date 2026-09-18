import { DEFAULT_MOVEMENT_CONFIG, SCENE_MANIFEST_SCHEMA_VERSION } from "@shared/index.js";

/**
 * Foundation app shell only. Product UI (src/ui), scene preparation
 * (src/scene), game runtime (src/game), and editor (src/editor) are owned
 * by other workers and land behind this shell.
 */
export function App() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>ObjectQuest</h1>
      <p>Foundation scaffold running. Scene manifest schema v{SCENE_MANIFEST_SCHEMA_VERSION}.</p>
      <p>Default movement config: {DEFAULT_MOVEMENT_CONFIG.id}</p>
    </main>
  );
}
