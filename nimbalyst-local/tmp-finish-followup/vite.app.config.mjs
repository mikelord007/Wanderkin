// Finish-recovery owner's own disposable real-App Vite server (copied from the
// reviewer's vite.final.config.mjs, without the pinning plugin). Private
// cacheDir, no /api proxy (Playwright mocks /api), no HMR, no watcher.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const repoRoot = path.resolve(new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"), "..", "..");
const port = Number(process.env.OQ_FINISH_APP_PORT ?? 5261);

// OQ_APP_AT=<commit> serves src/App.tsx exactly as it was at that commit (via
// `git show`, nothing on disk changes) for a pre-fix falsification run.
const appAt = process.env.OQ_APP_AT ?? null;
const pinApp = {
  name: "oq-finish-pin-app",
  enforce: "pre",
  load(id) {
    if (!appAt) return null;
    const rel = path.relative(repoRoot, id.split("?")[0]).replace(/\\/g, "/");
    if (rel !== "src/App.tsx") return null;
    return execFileSync("git", ["show", `${appAt}:src/App.tsx`], { cwd: repoRoot, encoding: "utf8" });
  },
};

export default defineConfig({
  root: repoRoot,
  cacheDir: path.join(tmpdir(), `oq-finish-recovery-app-cache-${appAt ?? "work"}-${port}`),
  plugins: [pinApp, react()],
  resolve: { alias: { "@shared": path.join(repoRoot, "shared") } },
  server: { port, strictPort: true, host: "127.0.0.1", hmr: false, watch: { ignored: ["**/*"] } },
});
