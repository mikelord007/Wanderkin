import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { REPO_ROOT } from "./repoRoot.js";

const TSX_CLI = join(REPO_ROOT, "node_modules", "tsx", "dist", "cli.mjs");
export const E2E_SERVER_ROOT = resolve(process.env.OBJECTQUEST_E2E_SERVER_ROOT ?? REPO_ROOT);
const SERVER_ENTRY = join(E2E_SERVER_ROOT, "server", "index.ts");

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

export interface ApiServerHandle {
  baseUrl: string;
  storageDir: string;
  port: number;
  /** Captured server stderr, for debugging a failed boot or an unexpected crash. */
  stderr: string[];
  stop(): Promise<void>;
}

/**
 * Spawns the ACTUAL server/index.ts as a real local child process (via tsx,
 * the same runner `npm run dev` uses) — not an in-process import of route
 * handlers. Each call gets its own free port and its own temporary
 * STORAGE_DIR so parallel test files never collide, and never touches the
 * shared dev server at :8787 or its storage. `mcpEndpoint` must point at a
 * local FakeMcpServer (see fakeMcpServer.ts) — never the real Livepeer
 * endpoint, per QA's no-real-generation-calls constraint.
 */
export async function startApiServer(opts: {
  mcpEndpoint: string;
  /** Reuse an existing durable store to exercise process-restart recovery. */
  storageDir?: string;
  /** Defaults to true for helper-created storage and false for supplied storage. */
  removeStorageOnStop?: boolean;
  /** Pass STORAGE_DIR relatively to exercise production path resolution. */
  useRelativeStoragePath?: boolean;
}): Promise<ApiServerHandle> {
  const port = await getFreePort();
  const storageDir = opts.storageDir ?? mkdtempSync(join(tmpdir(), "objectquest-e2e-"));
  const removeStorageOnStop = opts.removeStorageOnStop ?? opts.storageDir === undefined;

  const child: ChildProcessWithoutNullStreams = spawn(process.execPath, [TSX_CLI, SERVER_ENTRY], {
    cwd: E2E_SERVER_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      STORAGE_DIR: opts.useRelativeStoragePath
        ? relative(E2E_SERVER_ROOT, storageDir)
        : storageDir,
      LIVEPEER_MCP_ENDPOINT: opts.mcpEndpoint,
      LIVEPEER_API_KEY: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stderr: string[] = [];
  const stdout: string[] = [];
  child.stderr.on("data", (d: Buffer) => stderr.push(d.toString()));
  child.stdout.on("data", (d: Buffer) => stdout.push(d.toString()));

  let exited: { code: number | null; signal: NodeJS.Signals | null } | null = null;
  child.once("exit", (code, signal) => {
    exited = { code, signal };
  });

  const baseUrl = `http://127.0.0.1:${port}`;

  const deadline = Date.now() + 20_000;
  let lastErr: unknown;
  while (Date.now() < deadline) {
    if (exited) {
      throw new Error(
        `objectquest API process exited early (code=${exited.code}, signal=${exited.signal}) before becoming healthy.\n` +
          `--- stdout ---\n${stdout.join("")}\n--- stderr ---\n${stderr.join("")}`,
      );
    }
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) {
        return {
          baseUrl,
          storageDir,
          port,
          stderr,
          async stop() {
            child.kill();
            await new Promise<void>((resolve) => {
              if (child.exitCode !== null || child.signalCode !== null) {
                resolve();
                return;
              }
              child.once("exit", () => resolve());
            });
            if (removeStorageOnStop) {
              rmSync(storageDir, { recursive: true, force: true });
            }
          },
        };
      }
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  child.kill();
  if (removeStorageOnStop) {
    rmSync(storageDir, { recursive: true, force: true });
  }
  throw new Error(
    `Timed out waiting for the objectquest API process to become healthy at ${baseUrl}/api/health.\n` +
      `Last error: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}\n` +
      `--- stdout ---\n${stdout.join("")}\n--- stderr ---\n${stderr.join("")}`,
  );
}
