/**
 * Minimal JSON-RPC client for the Livepeer Agent MCP endpoint
 * (`https://agent.livepeer.org/api/mcp/full`). Confirmed against the
 * reference workspace's successful September 17, 2026 run
 * (`work/room-corner-rodin/run_test.py`): stateless `tools/call` POSTs,
 * no prior `initialize` handshake required, no auth header used for the
 * keyless demo path. If `LIVEPEER_API_KEY` is set we send it as a bearer
 * token, but this has not been exercised against a live key.
 */
import { env } from "../env.js";

export interface McpToolCallOptions {
  timeoutMs?: number;
}

/** Narrow surface `LivepeerAdapter` depends on, so tests can substitute a
 * fake transport without an `McpClient` instance (which carries private
 * fields TS would otherwise require a fake to structurally match). */
export interface McpToolCaller {
  callTool<T = Record<string, unknown>>(
    name: string,
    args: Record<string, unknown>,
    options?: McpToolCallOptions,
  ): Promise<T>;
}

export class McpToolError extends Error {
  readonly toolName: string;
  readonly retryable: boolean;
  readonly raw: unknown;

  constructor(message: string, toolName: string, retryable: boolean, raw: unknown) {
    super(message);
    this.name = "McpToolError";
    this.toolName = toolName;
    this.retryable = retryable;
    this.raw = raw;
  }
}

/** Structured JSON-RPC transport/network failure — distinct from a tool-level
 * error reported *by* the MCP server, since a timeout here does not prove the
 * call never reached the provider. Always treated as retryable. */
export class McpTransportError extends Error {
  readonly retryable = true;

  constructor(message: string, cause?: unknown) {
    super(message, cause !== undefined ? { cause } : undefined);
    this.name = "McpTransportError";
  }
}

let requestCounter = 0;

export class McpClient {
  constructor(
    private readonly endpoint: string = env.livepeerMcpEndpoint,
    private readonly apiKey: string = env.livepeerApiKey,
  ) {}

  get configured(): boolean {
    return this.endpoint.length > 0;
  }

  /**
   * Calls one MCP tool and returns its `structuredContent` (falling back to
   * the raw `content` text block, JSON-parsed when possible, when a tool has
   * no structured output). Throws `McpToolError` for a tool-level
   * error/`isError` result, or `McpTransportError` for a network/HTTP/
   * timeout failure.
   */
  async callTool<T = Record<string, unknown>>(
    name: string,
    args: Record<string, unknown>,
    options: McpToolCallOptions = {},
  ): Promise<T> {
    if (!this.configured) {
      throw new McpTransportError("LIVEPEER_MCP_ENDPOINT is not configured");
    }
    const timeoutMs = options.timeoutMs ?? 30_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const id = `objectquest-${Date.now()}-${++requestCounter}`;

    // The abort timer stays armed for the whole call, including body
    // decode — a slow/stalled response body must time out too, not just
    // the initial fetch() header round-trip.
    try {
      let response: Response;
      try {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        };
        if (this.apiKey) {
          headers.Authorization = `Bearer ${this.apiKey}`;
        }
        response = await fetch(this.endpoint, {
          method: "POST",
          headers,
          body: JSON.stringify({
            jsonrpc: "2.0",
            id,
            method: "tools/call",
            params: { name, arguments: args },
          }),
          signal: controller.signal,
        });
      } catch (err) {
        if (controller.signal.aborted) {
          throw new McpTransportError(
            `MCP call to "${name}" timed out after ${timeoutMs}ms (provider may still complete the job)`,
            err,
          );
        }
        throw new McpTransportError(`MCP call to "${name}" failed: ${(err as Error).message}`, err);
      }

      if (!response.ok) {
        const bodyText = await this.readBodyText(response, controller, timeoutMs, name);
        throw new McpTransportError(
          `MCP endpoint returned HTTP ${response.status} for "${name}": ${bodyText.slice(0, 500)}`,
        );
      }

      const bodyText = await this.readBodyText(response, controller, timeoutMs, name);
      const contentType = response.headers.get("content-type") ?? "";
      const payload = contentType.includes("text/event-stream")
        ? parseSseJsonRpc(bodyText, name)
        : parseJson(bodyText, name);

      const envelope = payload as {
        error?: { message?: string; code?: number };
        result?: {
          isError?: boolean;
          structuredContent?: unknown;
          content?: Array<{ type: string; text?: string }>;
        };
      };

      if (envelope.error) {
        throw new McpToolError(
          envelope.error.message ?? `MCP JSON-RPC error calling "${name}"`,
          name,
          false,
          envelope.error,
        );
      }

      const result = envelope.result;
      if (!result) {
        throw new McpTransportError(`MCP response for "${name}" had no result`);
      }
      if (result.isError) {
        const text = result.content?.find((c) => c.type === "text")?.text;
        throw new McpToolError(text ?? `Tool "${name}" reported an error`, name, false, result);
      }

      if (result.structuredContent !== undefined) {
        return result.structuredContent as T;
      }
      const text = result.content?.find((c) => c.type === "text")?.text;
      if (text === undefined) return {} as T;
      try {
        return JSON.parse(text) as T;
      } catch {
        return text as unknown as T;
      }
    } finally {
      clearTimeout(timer);
    }
  }

  private async readBodyText(
    response: Response,
    controller: AbortController,
    timeoutMs: number,
    name: string,
  ): Promise<string> {
    try {
      return await response.text();
    } catch (err) {
      if (controller.signal.aborted) {
        throw new McpTransportError(
          `MCP response body for "${name}" timed out after ${timeoutMs}ms (provider may still complete the job)`,
          err,
        );
      }
      throw new McpTransportError(`Failed to read MCP response body for "${name}": ${(err as Error).message}`, err);
    }
  }
}

function parseJson(text: string, toolName: string): unknown {
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new McpTransportError(`MCP response for "${toolName}" was not valid JSON`, err);
  }
}

/** Parses an `Accept: text/event-stream` response's `data:` frames as
 * JSON-RPC. Multiple `data:` lines in one event are joined per the SSE
 * spec; the last event that parses as JSON wins (keepalive/comment frames
 * earlier in the stream are ignored). */
function parseSseJsonRpc(text: string, toolName: string): unknown {
  const events = text
    .split(/\r?\n\r?\n+/)
    .map((block) =>
      block
        .split(/\r?\n/)
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice("data:".length).trimStart())
        .join("\n"),
    )
    .filter((data) => data.length > 0);

  for (let i = events.length - 1; i >= 0; i--) {
    try {
      return JSON.parse(events[i] as string);
    } catch {
      continue;
    }
  }
  throw new McpTransportError(`MCP SSE response for "${toolName}" had no parseable JSON-RPC event`);
}

export const mcpClient = new McpClient();
