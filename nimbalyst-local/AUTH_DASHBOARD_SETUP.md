# Wanderkin: turning on real Google sign-in (morning checklist)

**Today (no keys):** Sign in is a local stand-in. Clicking **Sign in** or **Get started** opens the dashboard at once as "Local explorer" (user id `local-dev`), and that user owns every world you've made so far.

**Once the keys are in `.env` and `npm run dev` has restarted:** the same buttons go to Google, with no code change.

Nothing below costs money. Supabase's free tier is enough.

---

## 1. Create the Supabase project (about 3 min)
1. Go to <https://supabase.com/dashboard>, click **New project**, and pick any name, password and region.
2. Open **Project Settings → API Keys**, or **Settings → API** in the older layout, and copy:
   - **Project URL**, which looks like `https://abcdefghijklmno.supabase.co`. The part before `.supabase.co` is your project ref.
   - **Publishable key** (`sb_publishable_…`), or the **anon / public** key if the project only shows legacy keys. Either works.
   - **Never** copy the `service_role` or secret key anywhere in this app.

## 2. Create the Google OAuth client (about 5 min)
1. Go to <https://console.cloud.google.com/apis/credentials> and select or create a project.
2. **OAuth consent screen:**
   - User type: **External**.
   - App name: Wanderkin, plus your support email.
   - While the app is in **Testing**, add your own Google account under **Test users**.
3. **Credentials → Create credentials → OAuth client ID:**
   - **Application type:** Web application.
   - **Authorized JavaScript origins:** `http://localhost:5173`.
   - **Authorized redirect URIs:** `https://<your-project-ref>.supabase.co/auth/v1/callback`. Google must send people back to **Supabase**, not to Wanderkin.
4. Copy the **Client ID** and **Client secret**.

## 3. Connect Google to Supabase (about 2 min)
1. In Supabase, go to **Authentication → Sign In / Providers → Google**. Turn it **on**, paste the Client ID and Client secret, and save.
2. Go to **Authentication → URL Configuration**:
   - **Site URL:** `http://localhost:5173`.
   - **Redirect URLs:** add `http://localhost:5173/auth/callback`. Wanderkin only ever asks Supabase to return here. Add your production origin's `/auth/callback` later.
3. JWT signing keys, under **Project Settings → JWT Keys**:
   - New projects use asymmetric signing keys. The server checks them against the public JWKS, so there's nothing to copy.
   - Only if the page shows just a **Legacy JWT secret**, copy it into `SUPABASE_JWT_SECRET` in step 4. That value is server-only.

## 4. Add the keys
The repo has no `.env` yet. Create `C:\Users\manuj\code_barely_runs\Objectquest\.env` with just these lines. Don't copy the whole `.env.example`.

```dotenv
VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable or anon key>
WANDERKIN_LEGACY_OWNER_EMAIL=<the Google email that should own your existing worlds>
# Only if step 3.3 showed a legacy secret:
# SUPABASE_JWT_SECRET=<legacy JWT secret>
```

How the one file feeds both sides:
- Vite puts the two `VITE_*` values in the browser. Both are public by design.
- The server reads the same file (`dotenv`) and reuses `VITE_SUPABASE_URL` to find the project's JWKS. A separate `SUPABASE_URL` is only needed if the server ever runs from a different env.

## 5. Restart (this is the step that switches it on)

**What needs a restart and what doesn't:**
- **Code changes** never need a restart:
  - The API (8787) runs under `tsx watch` and reloads itself when server code changes.
  - The web app (5173) hot-reloads client code.
  - The sign-in code is already live in stub mode.
- **Env changes** (the Supabase keys, `WANDERKIN_LEGACY_OWNER_EMAIL`, `SUPABASE_JWT_SECRET`) are read only at startup:
  - The **API (8787)** must be restarted. `tsx watch` doesn't watch `.env`.
  - The **web app (5173)** must be restarted for the `VITE_*` values. Vite usually restarts itself when `.env` changes, but restart it anyway so it's certain.

**Commands.** Both servers run from one `npm run dev` (via `concurrently`), so one restart covers both:
1. In the terminal where `npm run dev` is running, press **Ctrl+C**. Answer `Y` if asked to terminate the batch job.
2. From `C:\Users\manuj\code_barely_runs\Objectquest`, run:
   ```powershell
   npm run dev
   ```
3. Wait for both `VITE … ready` and `ObjectQuest API listening on http://localhost:8787`.
4. Reload any open Wanderkin tab.

If you ever run them separately instead, restart each one:
- API: `npx tsx watch server/index.ts`
- Web app: `npx vite`

Other dev servers on 15173/18799 are separate and don't need touching.

## 6. Check that real sign-in is active
1. The server terminal prints:
   `[auth] mode=supabase (Supabase URL configured); legacy owner email set`
2. <http://localhost:8787/api/auth/config> returns `"mode":"supabase"`. Before keys it says `"mode":"stub"`.
3. On <http://localhost:5173>, **Sign in** takes you to Google's account chooser, then back to **My worlds**.
4. **Account** shows your Google name, email and picture, with "Signed in with Google".
5. **My worlds** lists your existing worlds (the photo world and the others). On that first sign-in the server binds them to your account id in `storage/accounts.json` (`legacyClaim`). Worlds made with the local stand-in overnight also follow you.

## If something's off
| What you see | Fix |
|---|---|
| Google says `redirect_uri_mismatch` | The Google client's redirect URI must be exactly `https://<ref>.supabase.co/auth/v1/callback`. |
| Back on the landing with "Sign-in didn’t finish: …" | Check Supabase **Redirect URLs** includes `http://localhost:5173/auth/callback`, and that your account is a Test user on the consent screen. |
| Signed in, but My worlds says "Your sign-in has expired" (API 401) | The project signs with the legacy HS256 secret: set `SUPABASE_JWT_SECRET` and restart. The server logs a one-line warning naming this. |
| Signed in, but the old worlds aren't there | `WANDERKIN_LEGACY_OWNER_EMAIL` must match your Google email (any capitalisation). If the claim bound to the wrong account, stop the server, delete `storage/accounts.json`, fix the email, and restart. Nothing else changes. |
| "Sign-in is not configured" (503) | You're running with `NODE_ENV=production` and no Supabase URL. Production never uses the stand-in. |
| Want the stand-in back for local testing | Remove or comment out the two `VITE_SUPABASE_*` lines and restart, or set `VITE_WANDERKIN_AUTH_MODE=stub` (dev only). |

## Sign in from your own origin (Google names Wanderkin, not Supabase)
With the redirect flow, Google's consent screen says "to continue to `<ref>.supabase.co`". With `VITE_GOOGLE_CLIENT_ID` set, **Sign in** opens a small card holding Google's own button (plus One Tap where the browser supports FedCM). Google then says "to continue to wanderkin-tau.vercel.app" (or localhost). The ID token it returns is exchanged with Supabase (`signInWithIdToken`), so the session, `wk_session` cookie and world ownership are exactly as before.

1. **Env:** `VITE_GOOGLE_CLIENT_ID=<the Web client id>.apps.googleusercontent.com` in `.env`, and in Vercel for Production and Preview. It's public, and it's the **client id only**, never the secret. Restart the web app (and redeploy on Vercel) after changing it.
2. **Google Cloud Console → Credentials → your Web OAuth client → Authorized JavaScript origins:** add all three:
   - `https://wanderkin-tau.vercel.app`
   - `http://localhost:5173`
   - `http://localhost` (Google asks for the bare localhost too when testing on a local port)
   Keep the existing Supabase redirect URI: the fallback still uses it.
3. **Supabase → Authentication → Sign In / Providers → Google → Client IDs:** add the same client id (comma-separate it if others are there). Without it, Supabase rejects the token with an "audience" error, shown in the card.
4. **Skip nonce checks** in the same Supabase panel stays **off**. Wanderkin sends a nonce.

Fallback: without `VITE_GOOGLE_CLIENT_ID`, if Google's script can't load, or if its button doesn't appear within about 5 seconds, sign-in uses the Supabase redirect exactly as before. The card's **Use the standard sign-in** link always does the same.

## For later (production)
- Add `https://<your-domain>/auth/callback` to Supabase Redirect URLs, and your domain to the Google client's JavaScript origins.
- The Dockerfile already sets `NODE_ENV=production`. There the stand-in is impossible on both sides, and the media cookie gets `Secure`.
- Set the same `VITE_*` values at **build** time. Vite bakes them into the bundle.
