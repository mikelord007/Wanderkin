import type { ToolHandler } from "./fakeMcpServer.js";

/** `describe_capability` handler reporting both known capabilities as live
 * and available — mirrors the shape LivepeerAdapter.discoverCapabilities
 * reads (server/livepeer/adapter.ts), modeled on the real fields observed
 * during the 2026-09-18 live check recorded in docs/CONTRACTS.md. */
export const describeCapabilityAvailable: ToolHandler = (args) => {
  const name = args.name as string;
  return {
    found: true,
    availability: "available",
    status: "active",
    model_id: name === "tripo-mv3d" ? "tripo3d/h3.1/multiview-to-3d" : "fal-ai/hyper3d/rodin/v2.5",
    fallback_chain: name === "rodin-i3d" ? ["tripo-i3d", "triposplat"] : null,
  };
};

/** `upload` handler minting a fake (never fetched by our server) re-hosted
 * URL for each photo, like the real `upload` tool does. */
export const uploadFake: ToolHandler = (args) => ({
  url: `https://fake-livepeer-mcp.invalid/uploads/${Date.now()}-${args.filename ?? "photo"}`,
});

/** Builds a `run_capability` handler that hands out a unique fake provider
 * job id per call (so distinct submissions never collide) and tags each
 * returned job id with the request's own idempotency_key for easy
 * assertions in tests. */
export function runCapabilitySucceeds(): ToolHandler {
  let counter = 0;
  return (args) => {
    counter += 1;
    return {
      job_id: `fake-job-${counter}-${args.idempotency_key ?? "none"}`,
      status: "submitted",
      capability_used: args.capability,
      fallback_fired: null,
    };
  };
}

export function defaultMcpHandlers(): Record<string, ToolHandler> {
  return {
    describe_capability: describeCapabilityAvailable,
    upload: uploadFake,
    run_capability: runCapabilitySucceeds(),
    get_create_media: () => ({ status: "running" }),
  };
}
