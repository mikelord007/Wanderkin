import "dotenv/config";

/** Server-only environment access. Never import this module from src/. */
export const env = {
  port: Number(process.env.PORT ?? 8787),
  storageDir: process.env.STORAGE_DIR ?? "./storage",
  livepeerMcpEndpoint: process.env.LIVEPEER_MCP_ENDPOINT ?? "",
  livepeerApiKey: process.env.LIVEPEER_API_KEY ?? "",
};
