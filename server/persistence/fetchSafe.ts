import { lookup } from "node:dns/promises";
import type { LookupAddress } from "node:dns";
import { isIP } from "node:net";

export class UnsafeUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeUrlError";
  }
}

export class DownloadTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DownloadTooLargeError";
  }
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p))) return true;
  const [a, b] = parts as [number, number, number, number];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  return false;
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1") return true;
  if (lower.startsWith("fe80:")) return true; // link-local
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
  if (lower.startsWith("::ffff:")) return isPrivateIpv4(lower.slice("::ffff:".length));
  return false;
}

/** Best-effort SSRF guard: only plain https URLs, resolving to a public IP,
 * are allowed. Not a substitute for network-level egress controls, but
 * enough to stop a malicious/misconfigured provider response from pointing
 * this server at localhost/cloud-metadata/internal hosts. */
export async function assertSafeHttpsUrl(rawUrl: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError(`"${rawUrl}" is not a valid URL`);
  }
  if (url.protocol !== "https:") {
    throw new UnsafeUrlError(`Only https URLs are allowed, got "${url.protocol}"`);
  }
  const hostname = url.hostname;
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new UnsafeUrlError(`Refusing to fetch localhost URL "${rawUrl}"`);
  }
  if (isIP(hostname)) {
    if (isIP(hostname) === 4 ? isPrivateIpv4(hostname) : isPrivateIpv6(hostname)) {
      throw new UnsafeUrlError(`Refusing to fetch private/internal IP "${hostname}"`);
    }
    return url;
  }
  let records: LookupAddress[];
  try {
    records = await lookup(hostname, { all: true });
  } catch (err) {
    throw new UnsafeUrlError(`Could not resolve host "${hostname}": ${(err as Error).message}`);
  }
  if (records.length === 0) {
    throw new UnsafeUrlError(`Could not resolve host "${hostname}"`);
  }
  for (const record of records) {
    const isPrivate = record.family === 4 ? isPrivateIpv4(record.address) : isPrivateIpv6(record.address);
    if (isPrivate) {
      throw new UnsafeUrlError(`Host "${hostname}" resolves to a private/internal address`);
    }
  }
  return url;
}

export interface BoundedDownloadResult {
  buffer: Buffer;
  contentType: string | null;
}

const MAX_REDIRECTS = 5;

/** Downloads a URL with SSRF validation, a hard byte cap (aborting the
 * stream rather than buffering unbounded), and manual (never automatic)
 * redirect following — each hop gets its own SSRF check via
 * `assertSafeHttpsUrl` rather than trusting a `Location` header. A single
 * `AbortController`/timeout spans the WHOLE call, including every redirect
 * hop (not reset per hop), and a redirect chain longer than `MAX_REDIRECTS`
 * is refused — otherwise a redirect loop (or long chain) would never
 * terminate, or would keep resetting its own deadline forever. */
export async function downloadBounded(
  rawUrl: string,
  maxBytes: number,
  timeoutMs = 60_000,
): Promise<BoundedDownloadResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await downloadBoundedStep(rawUrl, maxBytes, controller.signal, MAX_REDIRECTS);
  } finally {
    clearTimeout(timer);
  }
}

async function downloadBoundedStep(
  rawUrl: string,
  maxBytes: number,
  signal: AbortSignal,
  redirectsLeft: number,
): Promise<BoundedDownloadResult> {
  const url = await assertSafeHttpsUrl(rawUrl);
  const response = await fetch(url, { redirect: "manual", signal });

  if (response.status >= 300 && response.status < 400) {
    // Redirect responses carry no body we want; drop it explicitly rather
    // than leaving the connection to be reclaimed implicitly.
    await response.body?.cancel().catch(() => undefined);
    if (redirectsLeft <= 0) {
      throw new UnsafeUrlError(`Too many redirects while fetching "${rawUrl}" (exceeded ${MAX_REDIRECTS})`);
    }
    const location = response.headers.get("location");
    if (!location) {
      throw new UnsafeUrlError(`Redirect from "${rawUrl}" had no Location header`);
    }
    return downloadBoundedStep(new URL(location, url).toString(), maxBytes, signal, redirectsLeft - 1);
  }

  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status} for "${rawUrl}"`);
  }
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > maxBytes) {
    throw new DownloadTooLargeError(
      `"${rawUrl}" declares ${declaredLength} bytes, exceeding the ${maxBytes}-byte limit`,
    );
  }
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      throw new DownloadTooLargeError(`"${rawUrl}" exceeded the ${maxBytes}-byte limit`);
    }
    return { buffer, contentType: response.headers.get("content-type") };
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > maxBytes) {
      await response.body.cancel().catch(() => undefined);
      throw new DownloadTooLargeError(`"${rawUrl}" exceeded the ${maxBytes}-byte limit while streaming`);
    }
    chunks.push(chunk);
  }
  return { buffer: Buffer.concat(chunks), contentType: response.headers.get("content-type") };
}
