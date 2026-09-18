import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    if (existsSync(join(dir, "package.json")) && existsSync(join(dir, "server"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`Could not locate repo root (package.json + server/) from ${startDir}`);
    dir = parent;
  }
}

/** Absolute path to the ObjectQuest repo root, located by walking up from
 * this file rather than assuming a fixed relative depth or process cwd. */
export const REPO_ROOT = findRepoRoot(dirname(fileURLToPath(import.meta.url)));
