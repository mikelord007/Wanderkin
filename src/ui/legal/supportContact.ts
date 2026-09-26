/**
 * The support address shown on the legal pages. It comes only from the
 * optional `VITE_SUPPORT_EMAIL` build setting and is never hard-coded; when
 * it is unset the pages point people to the app instead.
 */
export interface SupportEnv {
  VITE_SUPPORT_EMAIL?: string | undefined;
}

/** A plausible single address, trimmed, or null. */
export function resolveSupportEmail(env: SupportEnv): string | null {
  const value = env.VITE_SUPPORT_EMAIL?.trim();
  if (!value) return null;
  return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(value) ? value : null;
}

export function supportEmail(): string | null {
  return resolveSupportEmail({ VITE_SUPPORT_EMAIL: import.meta.env.VITE_SUPPORT_EMAIL as string | undefined });
}
