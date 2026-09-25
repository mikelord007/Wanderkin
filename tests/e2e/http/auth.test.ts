import { afterEach, describe, expect, it } from "vitest";
import { startApiServer, type ApiServerHandle } from "./helpers/apiServer.js";
import { startFakeMcpServer, type FakeMcpServer } from "./helpers/fakeMcpServer.js";
import { defaultMcpHandlers } from "./helpers/mcpHandlers.js";

/**
 * Sign-in on the REAL server/index.ts process (temp storage, fake MCP): the
 * default no-keys stub a developer gets from `npm run dev`, and the same
 * build under NODE_ENV=production, where the stub must be impossible.
 */
describe("sign-in on the real server process", () => {
  let api: ApiServerHandle | undefined;
  let mcp: FakeMcpServer | undefined;

  afterEach(async () => {
    await api?.stop();
    await mcp?.close();
    api = undefined;
    mcp = undefined;
  });

  it("defaults to the local stub with no keys: 401 signed out, dev user signed in, shares public", async () => {
    mcp = await startFakeMcpServer(defaultMcpHandlers());
    api = await startApiServer({ mcpEndpoint: mcp.url, env: { WANDERKIN_AUTH_MODE: "auto", NODE_ENV: "development" } });
    expect(await (await fetch(`${api.baseUrl}/api/auth/config`)).json()).toMatchObject({ mode: "stub" });
    expect((await fetch(`${api.baseUrl}/api/levels`)).status).toBe(401);
    const signedIn = await fetch(`${api.baseUrl}/api/levels`, { headers: { "X-Wanderkin-Dev-User": "local-dev" } });
    expect(signedIn.status).toBe(200);
    expect(await signedIn.json()).toEqual([]);
    expect((await fetch(`${api.baseUrl}/api/shares/0b0e0b0e-0000-4000-8000-000000000000`)).status).toBe(404);
  });

  it("refuses the stub under NODE_ENV=production even when asked for it", async () => {
    mcp = await startFakeMcpServer(defaultMcpHandlers());
    api = await startApiServer({ mcpEndpoint: mcp.url, env: { WANDERKIN_AUTH_MODE: "stub", NODE_ENV: "production" } });
    expect(await (await fetch(`${api.baseUrl}/api/auth/config`)).json()).toMatchObject({ mode: "unconfigured" });
    const response = await fetch(`${api.baseUrl}/api/levels`, { headers: { "X-Wanderkin-Dev-User": "local-dev" } });
    expect(response.status).toBe(503);
    expect((await fetch(`${api.baseUrl}/api/health`)).status).toBe(200);
  });
});
