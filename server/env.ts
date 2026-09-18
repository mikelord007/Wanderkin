import "dotenv/config";

/** Server-only environment access. Never import this module from src/. */
export const env = {
  port: Number(process.env.PORT ?? 8787),
  storageDir: process.env.STORAGE_DIR ?? "./storage",
  // Falls back to the known public endpoint even if .env was never copied
  // from .env.example, so a fresh checkout still works out of the box.
  livepeerMcpEndpoint: process.env.LIVEPEER_MCP_ENDPOINT ?? "https://agent.livepeer.org/api/mcp/full",
  livepeerApiKey: process.env.LIVEPEER_API_KEY ?? "",
};
