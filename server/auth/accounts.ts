import { join } from "node:path";
import { JsonFileStore } from "../persistence/jsonStore.js";
import type { AuthConfig } from "./config.js";
import { DEV_USER_ID, ownerIdFor, type Principal } from "./principal.js";

interface AccountsFile {
  /** The account that owns every world made before sign-in existed. Bound by
   * id on that account's first sign-in, so editing the env later can't hand
   * the worlds to someone else. */
  legacyClaim?: { userId: string; email: string; claimedAt: string };
}

/** What `OwnerSecurity` needs to decide who may open an unowned record. */
export interface LegacyOwnerPolicy {
  isLegacyOwner(principal: Principal | undefined): Promise<boolean>;
  /** Owner ids whose records the legacy owner also inherits. */
  legacyPoolOwners(): readonly string[];
}

/**
 * Legacy ownership without rewriting any stored record:
 * - stub mode: the local dev user is the legacy owner, virtually (no writes),
 *   so the real owner can still claim everything once keys arrive;
 * - supabase mode: the first signed-in account whose verified email equals
 *   WANDERKIN_LEGACY_OWNER_EMAIL is bound in storage/accounts.json, once. It
 *   also inherits anything the stub user made while keys were missing.
 */
export class LegacyOwnership implements LegacyOwnerPolicy {
  private readonly store: JsonFileStore<AccountsFile>;

  constructor(storageDir: string, private readonly config: Pick<AuthConfig, "mode" | "legacyOwnerEmail">) {
    this.store = new JsonFileStore(join(storageDir, "accounts.json"), () => ({}));
  }

  async isLegacyOwner(principal: Principal | undefined): Promise<boolean> {
    if (!principal) return false;
    if (this.config.mode === "stub") return principal.id === DEV_USER_ID;
    if (this.config.mode !== "supabase" || principal.provider === "stub") return false;

    const claim = (await this.store.read()).legacyClaim;
    if (claim) return claim.userId === principal.id;
    if (!this.matchesLegacyEmail(principal)) return false;
    return this.store.update((current) => {
      // Re-check under the store's lock: two first requests may race here.
      current.legacyClaim ??= {
        userId: principal.id,
        email: principal.email!,
        claimedAt: new Date().toISOString(),
      };
      return current.legacyClaim.userId === principal.id;
    });
  }

  legacyPoolOwners(): readonly string[] {
    return this.config.mode === "supabase" ? [ownerIdFor(DEV_USER_ID)] : [];
  }

  async currentClaim(): Promise<AccountsFile["legacyClaim"]> {
    return (await this.store.read()).legacyClaim;
  }

  private matchesLegacyEmail(principal: Principal): boolean {
    return Boolean(
      this.config.legacyOwnerEmail &&
      principal.emailVerified &&
      principal.email &&
      principal.email.toLowerCase() === this.config.legacyOwnerEmail,
    );
  }
}
