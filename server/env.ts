import "dotenv/config";
import { resolve } from "node:path";

/** Express `sendFile` requires absolute paths. Resolve the configured storage
 * root once so every store and file-serving route shares the same safe base. */
export function resolveStorageDir(configured: string | undefined): string {
  return resolve(configured ?? "./storage");
}

/** Server-only environment access. Never import this module from src/. */
export const env = {
  port: Number(process.env.PORT ?? 8787),
  storageDir: resolveStorageDir(process.env.STORAGE_DIR),
  // Falls back to the known public endpoint even if .env was never copied
  // from .env.example, so a fresh checkout still works out of the box.
  livepeerMcpEndpoint: process.env.LIVEPEER_MCP_ENDPOINT ?? "https://agent.livepeer.org/api/mcp/full",
  livepeerApiKey: process.env.LIVEPEER_API_KEY ?? "",
};
