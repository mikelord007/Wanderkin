import { afterEach, describe, expect, it, vi } from "vitest";
import { McpClient, McpToolError, McpTransportError } from "./mcpClient.js";

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("McpClient.callTool", () => {
  it("returns structuredContent from a normal JSON response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ jsonrpc: "2.0", id: 1, result: { structuredContent: { ok: true } } })),
    );
    const client = new McpClient("https://mcp.example.invalid", "");
    await expect(client.callTool("list_capabilities", {})).resolves.toEqual({ ok: true });
  });

  it("parses a text/event-stream response's data: frames as the JSON-RPC envelope", async () => {
    const sse =
      ": keepalive\n\n" +
      'data: {"jsonrpc":"2.0","id":1,"result":{"structuredContent":{"job_id":"mjob_1"}}}\n\n';
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(sse, { status: 200, headers: { "content-type": "text/event-stream" } })),
    );
    const client = new McpClient("https://mcp.example.invalid", "");
    await expect(client.callTool("run_capability", {})).resolves.toEqual({ job_id: "mjob_1" });
  });

  it("JSON-parses a plain-text content fallback when structuredContent is absent", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          jsonrpc: "2.0",
          id: 1,
          result: { content: [{ type: "text", text: '{"url":"https://example.invalid/x.jpg"}' }] },
        }),
      ),
    );
    const client = new McpClient("https://mcp.example.invalid", "");
    await expect(client.callTool("upload", {})).resolves.toEqual({ url: "https://example.invalid/x.jpg" });
  });

  it("falls back to the raw string when the text content block is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: "plain status text" }] } }),
      ),
    );
    const client = new McpClient("https://mcp.example.invalid", "");
    await expect(client.callTool<string>("some_tool", {})).resolves.toBe("plain status text");
  });

  it("throws McpToolError with the tool's error text when isError is set", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({ jsonrpc: "2.0", id: 1, result: { isError: true, content: [{ type: "text", text: "boom" }] } }),
      ),
    );
    const client = new McpClient("https://mcp.example.invalid", "");
    const error = await client.callTool("run_capability", {}).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(McpToolError);
    expect((error as McpToolError).message).toBe("boom");
  });

  it("wraps a non-2xx HTTP status as McpTransportError including the response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream on fire", { status: 502 })),
    );
    const client = new McpClient("https://mcp.example.invalid", "");
    await expect(client.callTool("run_capability", {})).rejects.toThrow(/502.*upstream on fire/s);
  });

  it("times out (and reports McpTransportError, not a hang) when the body never arrives", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          }),
      ),
    );
    const client = new McpClient("https://mcp.example.invalid", "");
    const promise = client.callTool("run_capability", {}, { timeoutMs: 1000 });
    const assertion = expect(promise).rejects.toBeInstanceOf(McpTransportError);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });
});
