import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startApiServer, type ApiServerHandle } from "./helpers/apiServer.js";
import { startFakeMcpServer, type FakeMcpServer } from "./helpers/fakeMcpServer.js";
import { describeCapabilityAvailable } from "./helpers/mcpHandlers.js";

/**
 * A fresh api+mcp pair per test (rather than the shared-beforeAll pattern
 * used elsewhere in this directory): LivepeerAdapter.discoverCapabilities
 * caches a successful result in-process for 5 minutes
 * (server/livepeer/adapter.ts DISCOVERY_CACHE_TTL_MS), so a shared server
 * across an "available" test and a "nothing confirmable" test would let the
 * first test's cached success mask the second test's failure scenario.
 */
describe("GET /api/capabilities", () => {
  let api: ApiServerHandle | undefined;
  let mcp: FakeMcpServer | undefined;

  beforeEach(() => {
    api = undefined;
    mcp = undefined;
  });

  afterEach(async () => {
    await api?.stop();
    await mcp?.close();
  });

  it("returns both capabilities once describe_capability live-confirms them available/active", async () => {
    mcp = await startFakeMcpServer({ describe_capability: describeCapabilityAvailable });
    api = await startApiServer({ mcpEndpoint: mcp.url });

    const res = await fetch(`${api.baseUrl}/api/capabilities`);
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<{ id: string; registeredModel: string }>;
    expect(list.map((d) => d.id).sort()).toEqual(["rodin-i3d", "tripo-mv3d"]);
    expect(list.find((d) => d.id === "rodin-i3d")?.registeredModel).toBe("fal-ai/hyper3d/rodin/v2.5");
  }, 20_000);

  it("drops a capability the provider reports as degraded instead of returning it as usable", async () => {
    mcp = await startFakeMcpServer({
      describe_capability: (args) => ({
        found: true,
        availability: args.name === "rodin-i3d" ? "available" : "unavailable",
        status: args.name === "rodin-i3d" ? "active" : "disabled",
        model_id: "whatever",
      }),
    });
    api = await startApiServer({ mcpEndpoint: mcp.url });

    const res = await fetch(`${api.baseUrl}/api/capabilities`);
    expect(res.status).toBe(200);
    const list = (await res.json()) as Array<{ id: string }>;
    expect(list.map((d) => d.id)).toEqual(["rodin-i3d"]);
  }, 20_000);

  it("returns 503 with a generic message — never internal detail — when nothing can be confirmed", async () => {
    mcp = await startFakeMcpServer({
      describe_capability: () => {
        throw new Error("simulated internal failure mentioning host internal-mcp-worker-7.svc.cluster.local");
      },
    });
    api = await startApiServer({ mcpEndpoint: mcp.url });

    const res = await fetch(`${api.baseUrl}/api/capabilities`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { message: string };
    expect(Object.keys(body)).toEqual(["message"]);
    expect(body.message).not.toMatch(/internal-mcp-worker/);
    // The sample level and GLB import must stay usable regardless — this
    // route failing is not fatal to the rest of the app (docs/LIVEPEER.md).
    expect(body.message).toMatch(/sample level|import a GLB/i);
  }, 20_000);
});
