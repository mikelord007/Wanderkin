# Wanderkin: Google sign-in and dashboard design

Worker: Claude Opus 5.5 (`claude-opus-5-5`), auth and dashboard worker. Parent orchestrator: f8543364-0062-46b3-b257-253a08306202.
Written 2026-09-26 (IST night), before any code. The request and binding decisions are in [AUTH_DASHBOARD_REQUEST.md](AUTH_DASHBOARD_REQUEST.md).

## Implementation outcome (2026-09-26, same night)

**Commits:**
| Commit | Content |
|---|---|
| `92a367f` | client auth core and deps |
| `2beca34` | server auth and ownership |
| `99faed6` | dashboard screens |
| `217fd86` | wiring: login-gated app |

**Built as designed, with these specifics:**
- My worlds opens on a "Jump back in" banner (latest finished world, image-led, Play first) above the library.
- On mobile, the avatar in the top bar links to Account.
- The landing's library section became a sign-in invitation. Import moved to the bottom of My worlds.

**Verification:**
- tsc: client 0, server 0.
- Full vitest, sequential: 103 files, 928/928.
- HTTP e2e: 8 files, 48/48, including the new real-process `tests/e2e/http/auth.test.ts`.
- Headless Chrome walkthrough on a disposable Vite (5391) and API (8891) with a temp storage copy, at 1440 and 375:
  - 0 page errors, 0 overflow.
  - Sign in reaches /worlds in about 70 ms.
  - My worlds lists the 3 legacy worlds.
  - Sign-out returns to the landing; a signed-out /worlds shows the prompt.
  - A share link and a sample both play signed out.
- Production build check:
  - No keys: neither the stub nor Supabase code is in the bundle (mode "unconfigured").
  - With keys: the SDK is a separate lazy chunk and `local-dev` appears nowhere.
- Morning steps: [AUTH_DASHBOARD_SETUP.md](AUTH_DASHBOARD_SETUP.md). Screenshots: `design/shots/dashboard/` (log in `walk-log.txt`).

## 0. Summary

- **Provider:** Supabase Auth with Google OAuth, as the orchestrator decided. The audit found no reason to change it (§1).
- **Two client auth implementations behind one `AuthProvider` interface:**
  - `stub` works today with no keys: Sign in takes you straight to the dashboard as `local-dev`.
  - `supabase` is the real Google flow. It uses PKCE and switches on when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` exist. No code change is needed.
- **Server:**
  - A central auth middleware verifies Supabase JWTs with `jose`, using the project JWKS with an HS256 secret fallback.
  - A route policy table gates private routes.
  - The existing `OwnerSecurity` layer now takes its owner id from the signed-in user. That layer already guards every route through `issue`, `claim` and `canAccess`.
- **Ownership:** Stays in `storage/ownership.json`, the existing index; resource records are not rewritten.
  - A new world is claimed for `user:<id>`.
  - Legacy (unowned) worlds belong to the legacy owner. In stub mode that is the dev user. In real mode it is the Google account whose verified email equals `WANDERKIN_LEGACY_OWNER_EMAIL`. That account is bound by id on first sign-in, in a new `storage/accounts.json`.
- **Dashboard:** A light app shell with nav for My worlds, Create a world, Borrow a sample and Account. The landing stays public, with Sign in and Get started. Play, the editor, Finish and share pages keep their full-screen layouts.

## 1. Audit findings that shaped the design

| Finding | Consequence |
|---|---|
| The live 8787 server runs under **`tsx watch server/index.ts`** (pid 39384 under 27704), with no `.env` file. Every server file I save reloads it with my code. | The default settings with no env must keep the live dev app working: stub mode, no crash. Nothing may write to storage at boot, so there is **no boot migration**: ownership of legacy records is decided at request time. New server modules land before `index.ts` imports them, to keep broken states in between short. |
| `server/security/owner.ts` (`OwnerSecurity`) already gives every route an owner boundary: `issue`, `claim`, `canAccess`, `inherit`, `makePublic`, `canReuse`. Today the identity is an anonymous cookie token (`objectquest_owner`), and in `legacyOpen` mode (the default outside production) claims are skipped. | Swap the identity source rather than add new checks route by route. `current(req)` returns `user:<sub>` when a verified principal is on the request. When auth is on, claims are always written and unowned records follow the legacy-owner rule. |
| Storage today: `levels.json` holds 3 records, including the private photo world. `ownership.json` has only public `*` entries for bundled media, because claims were skipped in legacy-open mode. | Every existing world, job, photo and asset is unowned, so the legacy-owner rule covers them all with no rewrite. |
| The browser loads photos, GLBs and audio through plain `<img>`, loaders and `<audio>` URLs (`/api/photos/files/…`, `/api/assets/files/…`, `/api/generated-assets/files/…`), which can't carry an `Authorization` header. | Add a session cookie (`wk_session`, HttpOnly) holding the same credential, set by `POST /api/auth/session`. For CSRF safety the cookie authenticates **GET/HEAD only**; any mutation needs the header. |
| `src/ui/api.ts` `request()` is the single fetch wrapper for JSON calls. | Auth headers are added in one place. |
| Routing is hand-rolled (`src/ui/routing.ts` + `App.tsx` `Screen` union); `/worlds` currently scrolls the landing to its library. | Extend the same router: `/worlds` becomes the dashboard home. Add `/samples`, `/account` and `/auth/callback`. Guard the gated screens in `App`. |
| `StartScreen.tsx` is the landing, the samples and the "Your worlds" library all in one component. | Split out `WorldLibrary` (dashboard My worlds) and `SampleWorlds` (landing plus the Borrow page), so both places use the same code. The landing loses the private library, which now lives behind sign-in. |
| The `tests/e2e/http/**` suite (run on demand, not part of `npm test`) spawns the real server and checks the anonymous owner-token boundary. | Add `WANDERKIN_AUTH_MODE=off` (non-production only; the old anonymous behaviour). The e2e helper defaults to it so those contracts stay valid. A new e2e test boots the real server in stub mode and in production. |
| The Dockerfile sets `NODE_ENV=production`. | The production guard for stub mode has a real signal in deploys. |

Why not a different provider? Clerk and Auth0 give faster drop-in UI, but their free tiers are tighter and they pull more SDK into the client. Firebase Auth also works, but its ID tokens need Google cert verification, and it fits worse with a Postgres future. Auth.js (NextAuth) needs a server framework we don't have. Supabase gives Google OAuth with PKCE, a small JS SDK, a standard JWKS we can verify with `jose`, a free tier, and a clean path to moving world metadata into Postgres with RLS later. **Keep Supabase.**

## 2. Client architecture

```
src/auth/
  types.ts          AuthUser, AuthSession, AuthProvider interface, AuthMode
  config.ts         resolveClientAuthMode(env) -> "supabase" | "stub" | "unconfigured"  (pure, tested)
  stubProvider.ts   instant sign-in as { id: "local-dev" }, persisted in localStorage
  supabaseProvider.ts  Google OAuth via @supabase/supabase-js (dynamic import, PKCE)
  credentials.ts    authHeaders() used by api.ts; server cookie sync; current owner id
  returnTo.ts       same-origin return-path sanitiser (pure, tested)
  AuthContext.tsx   <AuthSessionProvider>, useAuth()
```

`AuthProvider` interface:
```ts
interface AuthProvider {
  readonly mode: "stub" | "supabase" | "unconfigured";
  init(): Promise<AuthSession | null>;          // restore a persisted session (supabase: also completes the PKCE callback)
  signIn(returnTo: string): Promise<AuthSession | null>; // stub: resolves a session; supabase: redirects (resolves null)
  signOut(): Promise<void>;
  accessToken(): Promise<string | null>;         // fresh token for the Authorization header (stub: null)
  onChange(listener: (session: AuthSession | null) => void): () => void;
}
```

**Mode selection** (`resolveClientAuthMode`):
1. `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` both set: **supabase**.
2. Otherwise, if not `import.meta.env.PROD`: **stub**.
3. Otherwise (a production build without keys): **unconfigured**. Sign in explains that sign-in is not set up; nothing gated opens.
- `VITE_WANDERKIN_AUTH_MODE=stub` can force stub in dev, even with keys (for local testing). It is ignored in production builds.
- The stub module is only reachable behind a `!import.meta.env.PROD` branch, so Vite drops it from production bundles.

**Supabase provider:**
- `createClient(url, anonKey, { auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: "wanderkin-auth" } })`.
- `signInWithOAuth({ provider: "google", options: { redirectTo: origin + "/auth/callback", queryParams: { prompt: "select_account" } } })`.
- `signOut({ scope: "local" })`.
- `@supabase/supabase-js` loads with a dynamic `import()` only in supabase mode, so stub mode never downloads it.

**Credentials bridge:**
- `api.ts` `request()` merges `await authHeaders()`:
  - `Authorization: Bearer <access_token>` in supabase mode.
  - `X-Wanderkin-Dev-User: local-dev` in stub mode.
- On sign-in and on every token refresh, the client calls `POST /api/auth/session` with that header. The server re-verifies it and sets `wk_session`, so image, GLB and audio URLs work.
- On sign-out, `DELETE /api/auth/session` clears it.

**Route guard:** `App` knows which screens are gated.
- While auth is `loading`, a gated route shows the loading screen.
- A signed-out visitor to a gated route gets the landing, with a sign-in prompt naming what they tried to open. `returnTo` is kept in sessionStorage.
- After sign-in (instant in stub mode; after the Google round trip in real mode), `/auth/callback`, or the stub's immediate resolution, sends them to the sanitised `returnTo`, default `/worlds`.

**Local (device) data:** editor drafts and creation records in localStorage get an optional `ownerId` tag when written while signed in. Lists show records whose tag matches the current user, plus untagged legacy records. This is backward-compatible: nothing is rewritten or deleted.

## 3. Server architecture

```
server/auth/
  config.ts      resolveAuthConfig(process.env) -> { mode, supabaseUrl, issuer, jwksUrl, jwtSecret, legacyOwnerEmail, production }
  verify.ts      createSupabaseVerifier({ issuer, jwks?, jwtSecret? }) -> verify(token) -> Principal
  principal.ts   WeakMap<Request, Principal>: setPrincipal / principalOf (no global type augmentation)
  middleware.ts  authenticate (attach principal), requireUser (policy-driven), session routes, /api/auth/config, /api/auth/me
  policy.ts      isGatedRoute(method, path): the public/private table below, tested
  accounts.ts    AccountStore (storage/accounts.json): legacy claim binding; LegacyOwnerPolicy for OwnerSecurity
```

### Modes (`WANDERKIN_AUTH_MODE`, default `auto`)

| Resolved mode | When | Accepted credentials |
|---|---|---|
| `supabase` | A Supabase URL resolves (`SUPABASE_URL`, else `VITE_SUPABASE_URL` from the same `.env`) and the mode is `auto` or `supabase` | `Authorization: Bearer <Supabase JWT>`; `wk_session` cookie for GET/HEAD |
| `stub` | No Supabase URL, `NODE_ENV !== "production"`, mode `auto` or `stub` | `X-Wanderkin-Dev-User: local-dev`; `wk_session=dev:local-dev` for GET/HEAD |
| `off` | Explicit `WANDERKIN_AUTH_MODE=off`, non-production only | none: the old anonymous owner-token behaviour, no gating (for the legacy e2e suite) |
| `unconfigured` | Production with no Supabase URL, or `stub`/`off` requested in production | none: gated routes return **503** "Sign-in is not configured" (fail closed) |

**Deviation from the orchestrator's example, and why.** The request suggested accepting the dev header only when `WANDERKIN_AUTH_MODE=stub` is set explicitly. I made `auto` resolve to stub when there are no keys. Reasons:
1. The live 8787 has no `.env` and hot-reloads my code, so an explicit opt-in would break the live dev app overnight.
2. It would add a morning step to undo.
3. `auto` flips both sides to real auth from the same `.env` keys.

The production guard is unchanged and absolute: with `NODE_ENV=production`, stub is never accepted (a dev header gets 401), whatever the mode. The server logs its resolved auth mode at boot, and `GET /api/auth/config` reports it.

### JWT verification (`jose` 6)

- **Primary:** `createRemoteJWKSet(new URL(issuer + "/.well-known/jwks.json"))`, which caches and handles key rotation.
  - Supabase's asymmetric signing keys (ES256/RS256) are the default for new projects.
  - `jwtVerify(token, jwks, { issuer: supabaseUrl + "/auth/v1", audience: "authenticated", algorithms: ["ES256", "RS256", "EdDSA"] })`.
- **Fallback:** if the token header says `HS256` (a legacy-secret project), verify with `SUPABASE_JWT_SECRET` when it's set; otherwise reject with a clear server log line naming the missing variable.
- **Principal:** `{ id: sub, email, emailVerified, provider: app_metadata.provider, name, avatarUrl }`.
- Expiry is always checked, and tokens are never logged.
- **Tests:** a locally generated ES256 key pair. `createLocalJWKSet` is injected in place of the remote set, so the real `jwtVerify` path runs with no network. There is an HS256 case with a secret, and negative cases: wrong issuer, wrong audience, expired, bad signature, `alg: none`.

### Route policy (401 = no or invalid credential, 403 = cookie-only credential on a mutation)

| Route | Access |
|---|---|
| `GET /api/health`, `/api/movement-config`, `/api/capabilities` | public |
| `GET /api/auth/config` | public |
| `POST/DELETE /api/auth/session`, `GET /api/auth/me` | signed-in (DELETE also works signed-out, to clear a stale cookie) |
| `GET /api/shares/:shareId` | **public** (share links) |
| `GET /api/photos/files/*`, `/api/assets/:id`, `/api/assets/files/*`, `/api/generated-assets/*` | ownership-based, not gated: public (`*`) media from published worlds and bundled audio stay readable when signed out; private media returns 404 |
| `/api/levels` (list/create), `/api/levels/:id` (read/save), `…/publish`, `…/publications`, `…/export`, `/api/levels/import` | **signed-in**, then ownership (another user's world returns 404, the existing no-enumeration convention) |
| `/api/uploads`, `/api/screenshots`, `/api/assets/import`, `/api/jobs/**`, `/api/quests`, `/api/audio`, `/api/postcards/**` | **signed-in**, then ownership |
| `GET /api/admin/spend` | unchanged (diagnostics token) |

Bundled samples never touch the API (JS modules plus `/samples/*` static files), so they play signed out.

### Ownership and legacy claim

- `OwnerSecurity.current(req)`: `user:<sub>` for a verified principal, else the old anonymous cookie token.
- `issue()` returns the user's context without setting the anonymous cookie.
- With auth on, the server builds `OwnerSecurity` with `legacyOpen = false`, so **every new record is claimed** for its creator through the existing `claim`/`inherit` calls in each route.
- **Unowned (legacy) records:** `canAccess` asks `LegacyOwnerPolicy.isLegacyOwner(principal)`.
  - **Stub:** the dev user is the legacy owner, virtually. **Nothing is written**, so the real owner can still claim these records in the morning.
  - **Supabase:** if `accounts.json` has `legacyClaim.userId`, only that user id qualifies. Otherwise the first principal whose verified email (Google provider, or `email_verified: true`) case-insensitively equals `WANDERKIN_LEGACY_OWNER_EMAIL` is bound: `{ userId, email, claimedAt }` goes into `accounts.json`, once. Binding to the id means a later env edit can't hand the worlds to someone else. If the variable is unset, legacy worlds stay private to nobody; they are not lost, and setting it later works.
- **Worlds created in stub mode overnight** are owned by `user:local-dev`. In supabase mode, the bound legacy owner also inherits `user:local-dev` records, so nothing the user tried locally disappears. Stub can't run in production, so no such records exist there.
- **Public reads are unchanged:** `makePublic` (`*`) on publish, shares, and bundled media.
- **Reversible:** delete `storage/accounts.json` and the new `user:*` entries in `ownership.json` to return to the old model. No existing record's bytes change.
- **Migration:** none at boot. The only writes are ordinary claims made by user actions, plus the one-time legacy binding at the owner's first real sign-in.

## 4. Dashboard IA

```
/                     Landing (public). Nav: Sign in (quiet) + Get started (primary). Signed in: "Open my worlds".
/auth/callback        Completes the Google round trip, then replaces to returnTo (default /worlds).
/worlds               Dashboard home: My worlds (gated)
/create               Create a world: the existing creation journey inside the shell (gated)
/create/generating/:j Generation progress inside the shell (gated)
/samples              Borrow a sample (gated inside the shell; the landing keeps its public "Worlds to borrow")
/account              Account: Google identity (avatar, name, email, provider), auth mode, Sign out (gated)
/edit/:id, /create/prepare*   Editor, full-screen as today (gated)
/play/:id             Full-screen play; bundled samples public, saved worlds gated
/finish/:id           unchanged (in-app only)
/share/:id(/play)     public, unchanged
```

**Shell:**
- **Desktop:** a quiet left sidebar, 248 px, white on the page lavender. It holds the logo, then nav items with line icons (the active item is a purple-ink label on a tint pill with a 3 px purple rail), a "Create a world" primary action, and at the bottom an identity chip (avatar and name) with Sign out.
- **At or below 860 px:** a top bar (logo, avatar menu) plus a horizontally scrolling tab row. Nothing overflows at 375 px.
- Content sits in `--wk-max` with `--wk-page-x`.
- Headings are product headings (`--wk-type-h2-product`), left-aligned.

**My worlds:**
- A header row: the title, a one-line count, "Create a world" primary, and a quiet "Import" menu (the landing's import disclosure moves here).
- Then the existing `WorldTile` library: 16:9 imagery-led cards, status badge on the image, Play dominant, and Edit/Export/Play saved as quiet text actions.
- Empty state: the portal-arch scene plus "Your first world starts with a photo" and Create.
- Loading: skeleton tiles that shimmer only when motion is allowed. Error: an inline notice and Retry.

**Borrow a sample:** the `SampleWorlds` grid (featured card and the rest), with Play now dominant and Edit course quiet.

**Account:**
- A white identity card: the Google avatar (or a monogram), name, email, "Signed in with Google" or "Local dev sign-in (stub mode)", and Sign out.
- A quiet note on where worlds are stored.
- In stub mode, a small banner explains that real Google sign-in activates once keys are added.

**Landing:**
- The hero keeps its copy. "Make my world" signs in first, then opens Create; in stub mode that is instant.
- The "Your worlds" section is replaced by a small signed-out prompt: "Sign in to see the worlds you've made".
- The Worlds to borrow section stays public and playable.

**Visual system:**
- Tokens only, from `tokens.css`: light page, white surfaces, plum text, purple accents.
- Imagery-led cards; no flat purple cards.
- AA contrast: `--wk-purple-ink` for labels, `--wk-text-3` as the lightest text.
- `prefers-reduced-motion` turns off lifts, zooms and shimmer.
- Focus rings use `--wk-focus`.

## 5. Security notes

- The client only ever holds the **anon (public) key**. No service-role key exists anywhere in the repo or its env files. The server needs no Supabase secret in JWKS mode.
- **OAuth:** PKCE. `redirectTo` is always this origin's `/auth/callback`. In Supabase, the redirect URL allowlist must list exactly the origins used: `http://localhost:5173/auth/callback`, plus production later.
- **`returnTo`:** only a same-origin relative path is accepted: it must start with a single `/`, must not start with `//` or `/\`, and must not contain `:` before the first `/`. Anything else falls back to `/worlds`.
- **CSRF:** the `wk_session` cookie is HttpOnly, `SameSite=Lax`, `Secure` in production, `Path=/api`, and its Max-Age is capped at the token's expiry. It authenticates only GET/HEAD. Mutations need the `Authorization` header or the dev header. A cross-site page can't set those without CORS, and the server sends no CORS headers. A cookie-only credential on a mutating gated route gets **403**.
- **Stub:** disabled in client production builds (`import.meta.env.PROD`) and on the server when `NODE_ENV === "production"`, in every mode. It is also rejected when the server is in supabase mode.
- **Sign-out** does all of the following:
  - Supabase `signOut` (removes the persisted session).
  - `DELETE /api/auth/session` (clears the cookie).
  - Stub: clears its localStorage key.
  - Resets in-memory auth state.
  - Navigates to the landing.
  - Device drafts are kept, but they are tag-filtered, so the next user doesn't see them.
- **JWT checks:** signature, `iss`, `aud=authenticated` and `exp`, with a whitelist of algorithms (never `none`). HS256 only with an explicit secret.
- **Privacy:** another user's world, job or media returns 404 rather than 403, so ids can't be enumerated (existing convention).

## 6. Env and config

| Variable | Side | Required for real auth | Default | Purpose |
|---|---|---|---|---|
| `VITE_SUPABASE_URL` | client (+ server fallback) | yes | unset | `https://<ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | client | yes | unset | anon or publishable key (public) |
| `VITE_WANDERKIN_AUTH_MODE` | client | no | `auto` | `auto` / `stub` (dev only) / `supabase` |
| `WANDERKIN_AUTH_MODE` | server | no | `auto` | `auto` / `supabase` / `stub` (non-prod) / `off` (non-prod, legacy e2e) |
| `SUPABASE_URL` | server | no | `VITE_SUPABASE_URL` | override if the server runs from a different env |
| `SUPABASE_JWT_SECRET` | server | only for legacy HS256 projects | unset | JWT secret fallback |
| `WANDERKIN_LEGACY_OWNER_EMAIL` | server | recommended | unset | Google email that claims every pre-login world |

Both Vite and the server read the repo-root `.env`: Vite for `VITE_*`, the server through `dotenv/config`.

## 7. Morning checklist (the full version is in AUTH_DASHBOARD_SETUP.md)

1. Create a Supabase project. Copy its Project URL and anon (publishable) key.
2. In Google Cloud Console, create an OAuth client (Web). Add the authorised redirect URI `https://<ref>.supabase.co/auth/v1/callback`.
3. In Supabase, go to Authentication → Providers → Google. Enable it and paste the Google client id and secret.
4. In Supabase, go to Authentication → URL Configuration. Set Site URL to `http://localhost:5173` and add the Redirect URL `http://localhost:5173/auth/callback`.
5. Add to `.env`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `WANDERKIN_LEGACY_OWNER_EMAIL`.
6. Restart `npm run dev` (8787 and 5173).
7. Check `GET /api/auth/config` shows `"mode":"supabase"`, and the landing's Sign in opens Google.

## 8. Implementation order and commits

1. **Auth core (client):** `src/auth/**`, `.env.example`, tests.
2. **Server:** `server/auth/**`, `owner.ts` identity and legacy policy, `index.ts` wiring, the e2e helper default `off`, and unit and HTTP tests. Includes 401/403, public paths, a real verifier with a local JWKS, and stub rejected in production.
3. **Dashboard shell and screens:** shell, My worlds, Borrow, Account, and the landing's Sign in / Get started. Built with the `frontend-design` skill.
4. **Wiring:**
   - `api.ts` headers and cookie sync.
   - `App` route guard and callback.
   - Owner tagging for local drafts and creations.
   - Home is `/worlds` when signed in.
   - Play exit returns to the dashboard.
5. **Verify:**
   - tsc for client and server.
   - Sequential vitest.
   - Disposable Vite and a server on a temp copy of storage: stub run-through, then screenshots at 1440 and 375.
6. **Deliver:** `AUTH_DASHBOARD_SETUP.md` and the final report.

**Dependencies:** `@supabase/supabase-js@2.117.2` (client, lazy chunk) and `jose@6.2.12` (server). Nothing else.

## 9. Assumptions (for the user to confirm in the morning)

- **A1.** `auto` mode resolves to stub when no keys are set and the server isn't in production (§3 deviation).
- **A2.** Borrow a sample inside the dashboard is gated. The landing keeps the same samples public, so signed-out play is unchanged.
- **A3.** The editor and play remain full-screen outside the shell. Create and generation progress live inside the shell.
- **A4.** Legacy worlds bind to the Google account id on the first sign-in with the legacy email. Stub-mode worlds follow them to that account.
- **A5.** Device-local drafts are tagged and filtered, not moved to the server.
- **A6.** Another user's world returns 404, not 403 (existing no-enumeration convention). 403 is used for a cookie-only credential on a mutation.
