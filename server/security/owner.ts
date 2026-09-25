import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { join } from "node:path";
import { JsonFileStore } from "../persistence/jsonStore.js";
import type { LegacyOwnerPolicy } from "../auth/accounts.js";
import { ownerIdFor, principalOf } from "../auth/principal.js";

export const OWNER_HEADER = "X-ObjectQuest-Owner";
export const OWNER_COOKIE = "objectquest_owner";
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const PUBLIC_OWNER = "*";

export type OwnedResourceKind =
  | "photo"
  | "asset"
  | "generated-asset"
  | "job"
  | "level"
  | "world"
  | "preview-cache";

export interface OwnerContext {
  ownerId: string;
  token: string;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function parseCookies(header: string | undefined): Map<string, string> {
  const values = new Map<string, string>();
  if (!header) return values;
  for (const part of header.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    try {
      values.set(part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1).trim()));
    } catch {
      // Ignore malformed cookie encoding instead of failing the request.
    }
  }
  return values;
}

function suppliedToken(req: Request): string | undefined {
  const token = req.get(OWNER_HEADER) ?? parseCookies(req.get("cookie")).get(OWNER_COOKIE);
  return token && TOKEN_PATTERN.test(token) ? token : undefined;
}

function resourceKey(kind: OwnedResourceKind, id: string): string {
  return `${kind}:${id}`;
}

/**
 * Owner boundary for the single-instance API.
 *
 * With sign-in on (`legacy` supplied), the owner is the signed-in account
 * (`user:<id>`, set by server/auth), every new record is claimed for it, and
 * records from before sign-in (no owner) open only for the legacy owner.
 * Without sign-in, the older anonymous owner token applies: raw tokens never
 * reach disk, and in legacy-open mode unowned records remain open and new
 * records intentionally stay unowned to support controlled migration.
 */
export class OwnerSecurity {
  private readonly ownership: JsonFileStore<Record<string, string[]>>;

  constructor(
    storageDir: string,
    readonly legacyOpen: boolean,
    private readonly secureCookie: boolean,
    private readonly legacy?: LegacyOwnerPolicy,
  ) {
    this.ownership = new JsonFileStore(join(storageDir, "ownership.json"), () => ({}));
  }

  current(req: Request): OwnerContext | undefined {
    const principal = principalOf(req);
    if (principal) return { token: "", ownerId: ownerIdFor(principal.id) };
    const token = suppliedToken(req);
    return token ? { token, ownerId: hashToken(token) } : undefined;
  }

  issue(req: Request, res: Response): OwnerContext {
    const existing = this.current(req);
    if (existing) return existing;
    const token = randomBytes(32).toString("base64url");
    const cookie = [
      `${OWNER_COOKIE}=${token}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      ...(this.secureCookie ? ["Secure"] : []),
    ].join("; ");
    res.setHeader("Set-Cookie", cookie);
    res.setHeader(OWNER_HEADER, token);
    return { token, ownerId: hashToken(token) };
  }

  async claim(kind: OwnedResourceKind, id: string, ownerId: string): Promise<void> {
    if (this.legacyOpen) return;
    await this.ownership.update((current) => {
      const key = resourceKey(kind, id);
      const owners = current[key] ?? [];
      if (!owners.includes(ownerId)) owners.push(ownerId);
      current[key] = owners;
    });
  }

  async inherit(
    targetKind: OwnedResourceKind,
    targetId: string,
    sourceKind: OwnedResourceKind,
    sourceId: string,
  ): Promise<void> {
    if (this.legacyOpen) return;
    const sourceOwners = await this.owners(sourceKind, sourceId);
    for (const ownerId of sourceOwners) await this.claim(targetKind, targetId, ownerId);
  }

  async canAccess(kind: OwnedResourceKind, id: string, req: Request): Promise<boolean> {
    const owners = await this.owners(kind, id);
    if (owners.includes(PUBLIC_OWNER)) return true;
    if (owners.length === 0) return this.legacy ? this.legacy.isLegacyOwner(principalOf(req)) : this.legacyOpen;
    const context = this.current(req);
    if (context !== undefined && owners.includes(context.ownerId)) return true;
    // Records the stub user made before real sign-in follow the legacy owner.
    const pool = this.legacy?.legacyPoolOwners() ?? [];
    if (this.legacy && owners.some((owner) => pool.includes(owner))) return this.legacy.isLegacyOwner(principalOf(req));
    return false;
  }

  async makePublic(kind: OwnedResourceKind, id: string): Promise<void> {
    await this.ownership.update((current) => {
      const key = resourceKey(kind, id);
      const owners = current[key] ?? [];
      if (!owners.includes(PUBLIC_OWNER)) owners.push(PUBLIC_OWNER);
      current[key] = owners;
    });
  }

  async isUnowned(kind: OwnedResourceKind, id: string): Promise<boolean> {
    return (await this.owners(kind, id)).length === 0;
  }

  /** Whether an older record without an embedded dedupe scope may be reused. */
  async canReuse(kind: OwnedResourceKind, id: string, ownerId?: string): Promise<boolean> {
    const owners = await this.owners(kind, id);
    if (this.legacyOpen) return owners.length === 0;
    return ownerId !== undefined && owners.includes(ownerId);
  }

  private async owners(kind: OwnedResourceKind, id: string): Promise<string[]> {
    return (await this.ownership.read())[resourceKey(kind, id)] ?? [];
  }
}
