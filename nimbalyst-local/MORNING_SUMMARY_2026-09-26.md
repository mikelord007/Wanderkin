# Wanderkin — morning summary (written ~00:45 IST, 26 Sep; the 07:10 resume updates it if more lands)

Everything below is committed on `main` unless marked. The live app at http://localhost:5173/ already runs all of it (reload the tab).

## 1. Sign in with Google + dashboard — DONE (stub mode live now)

- Commits: 92a367f (sign-in core: Supabase Google + local stand-in), 2beca34 (API serves each account only its own worlds; JWKS verification; stand-in impossible in production), 99faed6 (dashboard screens), 217fd86 (login gate + routing + per-account drafts).
- **Right now, without keys:** Sign in / Get started opens the dashboard instantly as "Local explorer", who owns your existing worlds (including the private photo world). Landing, bundled samples and share links stay public. Play, editor and Finish stay full-screen.
- **To switch on real Google sign-in:** follow `nimbalyst-local/AUTH_DASHBOARD_SETUP.md` (about 10 minutes, free tier). Short version:
  1. Supabase: New project → copy Project URL + publishable/anon key (never the service_role key).
  2. Google Cloud: OAuth consent screen (External; add yourself as a test user) → Web client with JavaScript origin `http://localhost:5173` and redirect URI `https://<project-ref>.supabase.co/auth/v1/callback`.
  3. Supabase → Authentication → Providers → Google: paste client ID/secret. URL Configuration: Site URL `http://localhost:5173`, Redirect URL `http://localhost:5173/auth/callback`.
  4. Create `.env` in the repo root with exactly: `VITE_SUPABASE_URL=…`, `VITE_SUPABASE_ANON_KEY=…`, `WANDERKIN_LEGACY_OWNER_EMAIL=<your Google email>` (+ `SUPABASE_JWT_SECRET` only if the project shows a legacy secret).
  5. **Restart is the switch:** Ctrl+C in the app terminal, then `npm run dev` (env edits are not hot-reloaded). Then http://localhost:8787/api/auth/config must say `"mode":"supabase"`.
  6. First Google sign-in with the legacy-owner email claims all your existing worlds.
- Verification done overnight: tsc clean; full test suite 928/928; HTTP e2e 48/48 (stand-in refused with 503 under production); 53 auth unit tests exercising the real JWT verify path with a local key set; production build contains neither the stand-in nor the SDK without keys; browser walk at 1440/375 clean; live storage untouched (no `.env`, no `storage/accounts.json` created).
- Not verified: the real Google round trip (needs your keys). Data still lives in the Node server storage, not Postgres (by decision; migration is a possible follow-up).
- Screenshots: `nimbalyst-local/design/shots/dashboard/`.

## 2. Environment upgrade, wave 1 (Tropical + Desert) — DONE, independently APPROVED

- Framework: 6ec0947, dbf0c4f, 42ed169, 6b166bc (groves), 46091be + f506409 (lighting, per-biome knobs), aaaf0d1, 715c5f7 (cracked earth), f9dbf5e (regional tone), 12ef492 (test-only deadline injection, parallel runs no longer flake).
- Tropical: 23de3bf palms, 16113c9 bushes, 96154a0 rocks, 572fd96 markers/palette, 28c15d3, f0c3af0, f75e081 timber decks, 6093617 final fixes.
- Desert: a485d4b cacti, 09378ab sandstone rocks + layered walls, 7f2c3f2 dressing/negative space, eb92a88 palette/light.
- Review (`nimbalyst-local/ENVIRONMENT_WAVE1_REVIEW.md`): 812/812 tests; all invariants hold (props never collide; structure colliders untouched; footprint contract and placement safety unchanged; Original pixel-identical; no new deps); perf on mains p50 17.6–17.7 ms, 0 frames > 50 ms; 14/15 acceptance criteria MET, #5 PARTLY (steps/platforms still read as boxes at distance in deep furniture shade).
- In progress (lead): a polish commit for the review findings (ground-tint stain on the Rodin adventure, shell contrast in shade + base dressing ring, a pink posterisation band under the Tripo sofa, decal clamp), then the scaffold for wave 2.

## 3. Wave 2 — three new biomes (your request), IN PROGRESS

Picks: **Snowy Alpine**, **Autumn Forest**, **Volcanic Ember** (details in `ENVIRONMENT_UPGRADE_LEDGER.md` "Wave 2"). Alternatives considered: candy, swamp, underwater. Say if you want a swap (the workers have already built all three; a swap would be a new build).

**Status at ~06:20 IST — all three new biomes are BUILT:**
- Framework: scaffold 8383368; wave-1 polish 240ef7b; placement fairness 435eac1 (rocks no longer starved; Tropical rocks 4/0 → 25/19); six-look picker 0234907; floor hue fix 7581478; shadow-ring fix 9568741 (floors band base colour before lighting; 1003/1003 tests; Original unchanged).
- **Snowy Alpine FINAL:** 8154185 conifers, c5f75d6 snow-capped rocks + granite steps, 07f1633 shrubs/cairns/trail poles/drifts, 1b3014c palette/light, 1eb1867 polish, b2fa9b3 wall ramp. Gate 356/356. Lead reviews of M1/M2: APPROVE.
- **Autumn Forest FINAL:** 01b489c trees, 2d25cb4 rocks/deadwood/timber steps, 0092988 undergrowth, 556e5e2 floor/light, 980f370 review follow-ups. Gate 356/356. Lead reviews of M1/M2: APPROVE. Its 4× near-player crop shows a smooth shadow disc (no rings).
- **Volcanic Ember FINAL:** a26c804 basalt/obsidian/cinder + basalt walls, 522a223 snags/ash plants/fire lilies, 30652e4 lava cracks/vents, 9fe23a3 ash floor/dusk sun, 04622a9 floor re-check (no change) + basalt wall contrast lift. Gate 356/356. Lead review of M1: APPROVE.
- Autumn's and Alpine's floor re-checks against the ring fix: no change needed (smooth shadows; Alpine snow is now off-white #ecece7 with icy shade instead of clipping to pure white).
- Tropical/Desert sand re-tune DONE (544e70d: warm peach-tan and warm amber restored under the hue-faithful floors).
- Ember's floor re-check: no change needed; its basalt wall contrast lift is in (04622a9). All three biome workers released.
- Framework follow-ups DONE (daa9810: wall course height option, wall-colour guardrails green on all five biomes, harness pose that finally captures Rodin's adventure structures unobstructed; 1009/1009). Planner keyword hints for the new biomes DONE (c754d52: the offline planner can now pick Alpine/Autumn/Ember from a description; 1010/1010).
- **Independent wave-2 review: APPROVE** (`nimbalyst-local/ENVIRONMENT_WAVE2_REVIEW.md`, snapshot daa9810 + c754d52). No Critical/High/Medium findings. Invariants all hold; Original pixel-identical to both the wave-1 and phase-1 frames; all six looks verified in real Chrome on both scans; perf on AC at baseline; no shadow rings on any themed floor; criterion 10 MET (each look clearly distinct yet one game); criterion 14 MET (adding a biome was data + own builders; the framework needed no change). Three Low follow-ups in flight: A1 Autumn's low sun crushes the Tripo sofa underside to black (Autumn worker re-engaged), A2 Ember's tall shaded basalt steps read as blocks (Ember worker re-engaged), A3 triangle caps not test-guarded (lead). Reviewer released.
- Lead's own final reviews, all complete: Alpine APPROVE (ring check pass; Alpine's strong sun actually improves sofa recognisability vs Original); Autumn APPROVE (all earlier follow-ups confirmed applied; one carried Low: standard triangles at 92–93% of cap, disclosed); Ember APPROVE with one Medium (soil patches tinted for the old dark floor read as a stain around the Tripo adventure spawn on the new pale floor) — being fixed in the Ember worker's open follow-up commit together with A2.
- Lead's framework follow-up DONE (7e9b717: per-biome triangle caps are now test-guarded, the course-height option has containment tests, an optional per-art particle tint exists with unchanged defaults, perf tooling measures reduced effects for every look; 1026/1026). Ember's tall-steps fix DONE (f6b18ce). Lead released.
- Autumn A1 DONE (7488d5d: front-left sun; the Tripo sofa underside recovers more detail than Original).
- Ember spawn-patch fix DONE (4cdcfcc: ash-drift tints; the dark stain around the spawn is gone). Ember fully final.
- Alpine snowflake tint DONE (3c6c284; flakes ≈25 levels darker/bluer than lit snow; visibility over the snowfield inferred arithmetically, not captured in a frame). All three biome workers and the lead are released.
- **Closure check DONE: wave 2 CLOSED at final HEAD 3c6c284** (ENVIRONMENT_WAVE2_REVIEW.md §10). Every post-approval finding verified closed; nothing blocking remains; only the disclosed residuals (Autumn toadstool size, bracken up close, Alpine flakes over shaded snow, Ember glow under narrow props, rectangular shell silhouettes by design) are open. Every worker session is released. **Nothing is running; the project is yours for hands-on.**
- Previously in flight: lead's framework follow-ups (wall course height, wall-colour guardrails, least-occluded harness pose, planner keyword hints for the new biomes), and the remaining lead reviews. Then the independent wave-2 review, then your hands-on.

Historical detail (superseded by the block above): the lead's scaffold is committed (8383368: ids, baseline definitions, framework capabilities: snow caps, frozen/lava water, conifer/broadleaf builders, leaf litter, glowing cracks, snow/ember particles) and the wave-1 review polish too (240ef7b). Alpine, Autumn and Ember workers are all building on it (sessions 4ee3a9b8, 3f468900, 00ab5224); the six-option Look picker is DONE (0234907: 3×2 tiles with palette swatches; all six looks load in the real game; shots `design/shots/look-picker/`); the placement fairness fix is DONE (435eac1: rocks no longer starved in standard quality; Tropical rocks 4/0 → 25/19 on the two scans); Alpine M1 conifers (8154185) and M2 snow-capped rocks + granite steps (c5f75d6) landed; Autumn M1 broadleaf trees (01b489c) and M2 mossy rocks, deadwood and timber steps (2d25cb4) landed; Ember M1 basalt columns, obsidian, cinder cones and basalt walls (a26c804) and M2 charred snags, ash plants and fire lilies (522a223) landed; Alpine M1/M2 and Autumn M1 reviewed APPROVE by the lead (Autumn M2 and Ember M1 reviews queued). The framework floor fix is COMMITTED (7581478: themed helper floors posterise per luma band, removing the olive/pink/grey hue shifts for every biome; full suite 979/979; Original unchanged). Side-effect being re-tuned by the lead: the Tropical floor lost the extra saturation the old rounding had been adding (peach → khaki), so Tropical/Desert sand gets a small approved re-tune commit; the concentric shadow rings the first floor fix introduced were confirmed and fixed (9568741: floors band their base colour before lighting, so light and shadow stay smooth; hard floor steps roughly halved on Ember/Autumn; 1003/1003 tests); Alpine and Autumn are re-checking their floor tuning against it, Ember tunes on it; Alpine M3 shrubs/cairns/trail poles (07f1633) and Autumn M3 undergrowth (0092988) landed. **Autumn is FINAL** (M4 556e5e2; all four milestones; clean gate 355/355; worker released). **Alpine is FINAL** (M3 07f1633, M4 1b3014c, polish 1eb1867; gate 356/356; worker released). Ember M3 lava cracks, vents and ash scrub (30652e4) landed. Alpine's wall-ramp fix (b2fa9b3) is in; Alpine is fully final. Autumn's review follow-ups (980f370: thinner beam courses, thicker logs, reduced headroom) are in; its 4× near-player crop shows the player's shadow as one flat disc with no banding on the new floor treatment. Remaining: Ember M4, the lead's sand re-tune (+ ring check) and framework follow-ups (course height, wall guardrails, harness pose, planner hints for the new biomes), lead reviews, independent wave-2 review, your hands-on. Then lead reviews → independent review → your hands-on.

## 4. Also landed overnight

- UI redesign v3 (light system, hero light, dashboard-ready library, HUD, Finish, new logo): 2cb28aa … de1187f. Shots `design/shots/v3/` and `brand/`.
- Static-noise fix: abbb692 (the bundled breeze was white noise; now soft low wind, 12 dB under the music). Please confirm by ear in a sample world.

## 5. Needs your decision / attention

1. Confirm the auth assumptions (Supabase; public samples/share links; legacy-owner email approach) and add keys.
2. Confirm or swap the three wave-2 biomes.
3. **Hardware, please check first:** the battery drained all night while Windows reported AC power (16% → 11% → 9% → 8% → 6% by ~04:20 IST). The charger looks underpowered or the cable loose. If the machine shut down overnight, the durable state is in these docs and the 07:10 wakeup resumes once Nimbalyst is open again.
4. Follow-ups not done (say if wanted): ambience gets its own volume slider; engine honours each sound's authored gain (no 4× boost); narration kept on generated adventures (F-1); Postgres migration; Playwright browser e2e run.

## 6. Hands-on checklist (you own play-feel)

- Sign in (stand-in) → My worlds shows your worlds → Play one → Look: Original / Tropical / Desert → check the desk/sofa remain recognisable, props feel grounded, timber decks / sandstone steps read as structures, no static under the music.
- Start a new adventure in each look on both bundled rooms; pause and switch looks mid-run (progress must persist).
- Report anything off with a screenshot and the step.
