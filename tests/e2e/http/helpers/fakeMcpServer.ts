import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";

/**
 * A local, in-process fake of the Livepeer Agent MCP endpoint
 * (JSON-RPC `tools/call` over HTTP — see server/livepeer/mcpClient.ts).
 * This is a MOCKED PROVIDER FIXTURE, never the real
 * `https://agent.livepeer.org/api/mcp/full` endpoint. No test in this
 * directory may point LIVEPEER_MCP_ENDPOINT at anything else.
 */
export type ToolHandler = (args: Record<string, unknown>) => unknown | Promise<unknown>;

export interface McpCallRecord {
  name: string;
  args: Record<string, unknown>;
}

export interface FakeMcpServer {
  /** JSON-RPC endpoint URL to hand the real API process as LIVEPEER_MCP_ENDPOINT. */
  url: string;
  /** Every tool call received so far, in order — inspect to assert on
   * submit/resubmit/idempotency behavior without touching a real provider. */
  calls: McpCallRecord[];
  /** Replaces (or installs) the handler for one tool name; later calls to
   * that tool use the new handler immediately. */
  setHandler(name: string, handler: ToolHandler): void;
  callsFor(name: string): McpCallRecord[];
  close(): Promise<void>;
}

/** Starts the fake MCP HTTP server on an OS-assigned loopback port. */
export async function startFakeMcpServer(initialHandlers: Record<string, ToolHandler> = {}): Promise<FakeMcpServer> {
  const handlers = new Map<string, ToolHandler>(Object.entries(initialHandlers));
  const calls: McpCallRecord[] = [];

  const server: Server = createServer((req: IncomingMessage, res: ServerResponse) => {
    if (req.method !== "POST") {
      res.writeHead(405).end();
      return;
    }
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      void handleRequest();
    });

    async function handleRequest(): Promise<void> {
      let envelope: { id?: unknown; params?: { name?: string; arguments?: Record<string, unknown> } };
      try {
        envelope = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { message: "invalid JSON-RPC body" } }));
        return;
      }
      const name = envelope.params?.name ?? "";
      const args = envelope.params?.arguments ?? {};
      calls.push({ name, args });

      const handler = handlers.get(name);
      res.setHeader("Content-Type", "application/json");
      if (!handler) {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: envelope.id,
            result: { isError: true, content: [{ type: "text", text: `fake MCP: no handler registered for tool "${name}"` }] },
          }),
        );
        return;
      }
      try {
        const value = await handler(args);
        res.writeHead(200);
        res.end(JSON.stringify({ jsonrpc: "2.0", id: envelope.id, result: { structuredContent: value } }));
      } catch (err) {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            id: envelope.id,
            result: { isError: true, content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }] },
          }),
        );
      }
    }
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    url: `http://127.0.0.1:${port}/mcp`,
    calls,
    setHandler(name, handler) {
      handlers.set(name, handler);
    },
    callsFor(name) {
      return calls.filter((c) => c.name === name);
    },
    close() {
      return new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
    },
  };
}
