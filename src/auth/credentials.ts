/**
 * The bridge between the signed-in session and the plain API/storage modules,
 * which must not depend on React. `AuthSessionProvider` installs the active
 * provider's credentials here; `api.ts` reads them for every request, and the
 * device-local stores read the current owner id to tag and filter records.
 */

type CredentialSource = () => Promise<Record<string, string>>;

let source: CredentialSource = async () => ({});
let ownerId: string | null = null;

export function installCredentialSource(next: CredentialSource | null): void {
  source = next ?? (async () => ({}));
}

/** Headers proving who is calling: a Supabase bearer token, the stub's dev
 * header, or nothing when signed out. Never throws. */
export async function authHeaders(): Promise<Record<string, string>> {
  try {
    return await source();
  } catch {
    return {};
  }
}

export function setCurrentOwnerId(next: string | null): void {
  ownerId = next;
}

/** The signed-in account id, used to tag device-local drafts. */
export function currentOwnerId(): string | null {
  return ownerId;
}

/** A device-local record is visible to its owner, and untagged (pre-sign-in)
 * records stay visible so nothing made before accounts existed disappears. */
export function visibleToCurrentOwner(recordOwnerId: string | null | undefined): boolean {
  return !recordOwnerId || recordOwnerId === ownerId;
}

/**
 * Images, 3D models and audio load by URL and can't carry a header, so the
 * server also accepts the same credential from an HttpOnly cookie on GET/HEAD
 * requests only. This asks the server to set (or refresh) that cookie.
 */
export async function syncServerSession(request: typeof fetch = fetch): Promise<boolean> {
  const headers = await authHeaders();
  if (Object.keys(headers).length === 0) return false;
  try {
    const response = await request("/api/auth/session", { method: "POST", headers, credentials: "same-origin" });
    return response.ok;
  } catch {
    return false;
  }
}

export async function clearServerSession(request: typeof fetch = fetch): Promise<void> {
  try {
    await request("/api/auth/session", { method: "DELETE", credentials: "same-origin" });
  } catch {
    // Signing out locally must never wait on the network.
  }
}
