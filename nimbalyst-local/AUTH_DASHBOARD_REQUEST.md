# Auth + dashboard request (user, 2026-09-26 ~03:10 IST) — verbatim

Hey, I want to turn this into a login-gated web app so they have to log in using Google to see the worlds they created and create a new world. Supabase might be a good option to add, unless you find an even better version.

Convert this to a dashboard-style thing. Also I'm going to sleep right now so I won't be able to help you with the API key for Supabase right now, assuming you end up choosing Supabase. For now, make it so that clicking Sign In directly goes into the dashboard. Have the setup for the actual auth ready behind the scenes so that when I wake up in the morning, I just have to feed you the API key and it works instantly

---

## Orchestrator decisions made while the user sleeps (assumptions to confirm in the morning)

1. **Provider: Supabase Auth with Google OAuth** (hosted Postgres + auth + RLS + JS SDK, free tier, no lock-in of the game data). Worker may propose a better fit in its design doc with reasons, but must not block on it.
2. **Data stays in the existing Node server storage for now**, gaining an `ownerId` on worlds/drafts/jobs; the server verifies Supabase JWTs. No storage migration to Supabase Postgres in this round unless trivial and reversible.
3. **Public vs gated:** landing page, bundled sample worlds and shared links stay public; the dashboard (my worlds, create a world, drafts/jobs) requires sign-in.
4. **Stub mode until keys arrive:** with no Supabase env configured, "Sign in" signs the user in instantly as a stable local dev user and lands on the dashboard; the real Google flow activates automatically when `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (client) and the server-side verification config are present. Stub mode must be impossible in production builds.
5. **Existing worlds** (including the private photo world) are attributed to a configurable legacy-owner email (`WANDERKIN_LEGACY_OWNER_EMAIL`, not hard-coded) and claimed on that email's first Google login; in stub mode the dev user owns them.
6. **Dashboard style** follows the approved light system (UI_DIRECTION_V3.md) and the existing "Your worlds" library.
7. The live 8787 server is protected; enabling real auth will need a restart the user performs in the morning after adding keys (documented in the setup checklist).
