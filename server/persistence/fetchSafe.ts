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

/** Downloads a URL with SSRF validation, a hard byte cap (aborting the
 * stream rather than buffering unbounded), and no automatic redirect
 * following (a redirect target gets its own SSRF check by calling this
 * function again with the `Location` header rather than being trusted). */
export async function downloadBounded(
  rawUrl: string,
  maxBytes: number,
  timeoutMs = 60_000,
): Promise<BoundedDownloadResult> {
  const url = await assertSafeHttpsUrl(rawUrl);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { redirect: "manual", signal: controller.signal });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        throw new UnsafeUrlError(`Redirect from "${rawUrl}" had no Location header`);
      }
      clearTimeout(timer);
      return downloadBounded(new URL(location, url).toString(), maxBytes, timeoutMs);
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
        controller.abort();
        throw new DownloadTooLargeError(`"${rawUrl}" exceeded the ${maxBytes}-byte limit while streaming`);
      }
      chunks.push(chunk);
    }
    return { buffer: Buffer.concat(chunks), contentType: response.headers.get("content-type") };
  } finally {
    clearTimeout(timer);
  }
}
