// Final Opus review: disposable Vite server. PRIVATE cacheDir under the OS temp
// dir, no /api proxy (Playwright mocks /api read-only), no watcher, no HMR.
// OQ_VARIANT=before serves the 8 existing product source files changed by b9a00e5,
// 70f9863 and 13ed712 exactly as they were at 2625ef7 (via `git show`), so
// before/after run the same world through the same camera code. Nothing on
// disk is modified.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const repoRoot = path.resolve(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "..", "..");
const port = Number(process.env.OQ_FINAL_PORT ?? 5242);
const variant = process.env.OQ_VARIANT === "before" ? "before" : "after";

const PRODUCT_FILES = [
  "src/scene/materialRegions.ts",
  "src/scene/styleMaterial.ts",
  "src/scene/samples.ts",
  "src/game/render/Checkpoints.tsx",
  "src/game/render/ModeEntities.tsx",
  "src/game/render/GameStage.tsx",
  "src/game/render/PlayerAvatar.tsx",
  "src/game/render/character/characterAnimator.ts",
];
const pinned = new Set(variant === "before" ? PRODUCT_FILES : []);

const pinBase = {
  name: "oq-final-pin-base",
  enforce: "pre",
  load(id) {
    const rel = path.relative(repoRoot, id.split("?")[0]).replace(/\\/g, "/");
    if (!pinned.has(rel)) return null;
    return execFileSync("git", ["show", `2625ef7:${rel}`], { cwd: repoRoot, encoding: "utf8" });
  },
};

export default defineConfig({
  root: repoRoot,
  cacheDir: path.join(tmpdir(), `oq-final-opus-review-cache-${variant}-${port}`),
  plugins: [pinBase, react()],
  resolve: { alias: { "@shared": path.join(repoRoot, "shared") } },
  server: { port, strictPort: true, host: "127.0.0.1", hmr: false, watch: { ignored: ["**/*"] } },
});
