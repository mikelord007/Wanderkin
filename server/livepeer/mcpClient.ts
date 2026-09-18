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
   * the raw `content` text block when a tool has no structured output).
   * Throws `McpToolError` for a tool-level error/`isError` result, or
   * `McpTransportError` for a network/HTTP/timeout failure.
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
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      const bodyText = await response.text().catch(() => "");
      throw new McpTransportError(
        `MCP endpoint returned HTTP ${response.status} for "${name}": ${bodyText.slice(0, 500)}`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (err) {
      throw new McpTransportError(`MCP response for "${name}" was not valid JSON`, err);
    }

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
    return (text as unknown as T) ?? ({} as T);
  }
}

export const mcpClient = new McpClient();
