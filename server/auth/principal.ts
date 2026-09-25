import type { Request } from "express";

/** A verified caller. `id` is the Supabase user id (JWT `sub`), or
 * "local-dev" for the development stub. */
export interface Principal {
  id: string;
  email: string | null;
  emailVerified: boolean;
  /** "google" for real sign-in, "stub" for the local dev user. */
  provider: string;
  name: string | null;
  avatarUrl: string | null;
  /** Where the credential came from; cookies authenticate GET/HEAD only. */
  via: "header" | "cookie";
}

export const DEV_USER_ID = "local-dev";
export const DEV_USER_HEADER = "x-wanderkin-dev-user";
export const SESSION_COOKIE = "wk_session";

/** Owner ids recorded in storage/ownership.json for signed-in users. */
export function ownerIdFor(userId: string): string {
  return `user:${userId}`;
}

const principals = new WeakMap<Request, Principal>();

export function setPrincipal(req: Request, principal: Principal): void {
  principals.set(req, principal);
}

export function principalOf(req: Request): Principal | undefined {
  return principals.get(req);
}
