import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createEmptyManifest, type SceneManifest } from "../../shared/manifest.js";
import { LevelStore, createLevelsRouter } from "../levels.js";
import { AssetStore } from "../persistence/assetStore.js";
import { PhotoStore } from "../persistence/photoStore.js";
import { PublicationStore } from "../publications.js";
import { OwnerSecurity } from "../security/owner.js";
import { resolveAuthConfig, type AuthConfig } from "./config.js";
import { createAuthRuntime, installAuth } from "./index.js";
import { isGatedRoute } from "./policy.js";
import { createSupabaseVerifier, TokenRejectedError } from "./verify.js";

const SUPABASE_URL = "https://abcdefgh.supabase.co";
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const DEV = { "X-Wanderkin-Dev-User": "local-dev" };

type SigningKey = Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];

let privateKey: SigningKey;
let otherKey: SigningKey;
let publicJwk: JWK;

beforeAll(async () => {
  const pair = await generateKeyPair("ES256", { extractable: true });
  privateKey = pair.privateKey;
  publicJwk = { ...(await exportJWK(pair.publicKey)), kid: "test-key", alg: "ES256", use: "sig" };
  otherKey = (await generateKeyPair("ES256", { extractable: true })).privateKey;
});

function localJwks() {
  return createLocalJWKSet({ keys: [publicJwk] });
}

async function token(
  claims: Record<string, unknown> = {},
  options: { key?: SigningKey; issuer?: string; audience?: string; expiresIn?: string | number; sub?: string } = {},
): Promise<string> {
  return new SignJWT({
    email: "owner@example.com",
    role: "authenticated",
    app_metadata: { provider: "google", providers: ["google"] },
    user_metadata: { full_name: "Owner Person", avatar_url: "https://lh3.googleusercontent.com/x", email_verified: true },
    ...claims,
  })
    .setProtectedHeader({ alg: "ES256", kid: "test-key" })
    .setSubject(options.sub ?? "11111111-1111-4111-8111-111111111111")
    .setIssuer(options.issuer ?? ISSUER)
    .setAudience(options.audience ?? "authenticated")
    .setIssuedAt()
    .setExpirationTime(options.expiresIn ?? "1h")
    .sign(options.key ?? privateKey);
}

describe("server auth mode", () => {
  it("defaults to the stub outside production when no Supabase URL exists", () => {
    expect(resolveAuthConfig({}).mode).toBe("stub");
    expect(resolveAuthConfig({ NODE_ENV: "development", SUPABASE_URL: " " }).mode).toBe("stub");
  });

  it("switches to Supabase as soon as the (client) URL is in the same .env", () => {
    const config = resolveAuthConfig({ VITE_SUPABASE_URL: `${SUPABASE_URL}/`, WANDERKIN_LEGACY_OWNER_EMAIL: " Owner@Example.com " });
    expect(config).toMatchObject({
      mode: "supabase",
      supabaseUrl: SUPABASE_URL,
      issuer: ISSUER,
      jwksUrl: `${ISSUER}/.well-known/jwks.json`,
      legacyOwnerEmail: "owner@example.com",
    });
    expect(resolveAuthConfig({ SUPABASE_URL: "https://other.supabase.co", VITE_SUPABASE_URL: SUPABASE_URL }).supabaseUrl)
      .toBe("https://other.supabase.co");
  });

  it("never runs the stub (or the open legacy mode) in production", () => {
    expect(resolveAuthConfig({ NODE_ENV: "production" }).mode).toBe("unconfigured");
    expect(resolveAuthConfig({ NODE_ENV: "production", WANDERKIN_AUTH_MODE: "stub" }).mode).toBe("unconfigured");
    expect(resolveAuthConfig({ NODE_ENV: "production", WANDERKIN_AUTH_MODE: "off" }).mode).toBe("unconfigured");
    expect(resolveAuthConfig({ NODE_ENV: "production", WANDERKIN_AUTH_MODE: "stub", SUPABASE_URL }).mode).toBe("unconfigured");
    expect(resolveAuthConfig({ NODE_ENV: "production", SUPABASE_URL }).mode).toBe("supabase");
  });

  it("refuses an explicit supabase mode that has no URL instead of guessing", () => {
    expect(resolveAuthConfig({ WANDERKIN_AUTH_MODE: "supabase" }).mode).toBe("unconfigured");
  });
});

describe("route policy", () => {
  it.each([
    ["GET", "/api/levels"], ["POST", "/api/levels"], ["GET", "/api/levels/abc"], ["PUT", "/api/levels/abc"],
    ["POST", "/api/levels/abc/publish"], ["GET", "/api/levels/abc/export"], ["POST", "/api/levels/import"],
    ["POST", "/api/uploads"], ["POST", "/api/screenshots"], ["POST", "/api/assets/import"],
    ["POST", "/api/jobs/generate"], ["GET", "/api/jobs/job-1"], ["POST", "/api/quests"], ["POST", "/api/audio"],
    ["GET", "/api/postcards/level-1"], ["GET", "/api/auth/me"], ["POST", "/api/auth/session"],
    ["GET", "/API/LEVELS/"], ["GET", "/api/some-future-route"], ["DELETE", "/api/photos/files/a.jpg"],
  ])("gates %s %s", (method, path) => {
    expect(isGatedRoute(method, path)).toBe(true);
  });

  it.each([
    ["GET", "/api/health"], ["GET", "/api/capabilities"], ["GET", "/api/movement-config"], ["GET", "/api/auth/config"],
    ["GET", "/api/shares/0b0e0b0e-0000-4000-8000-000000000000"], ["GET", "/api/photos/files/a.jpg"],
    ["HEAD", "/api/assets/files/a.glb"], ["GET", "/api/assets/asset-1"], ["GET", "/api/generated-assets/bundled-music"],
    ["GET", "/api/generated-assets/files/x.wav"], ["DELETE", "/api/auth/session"], ["GET", "/index.html"],
  ])("leaves %s %s public", (method, path) => {
    expect(isGatedRoute(method, path)).toBe(false);
  });
});

describe("Supabase token verification (real jose path, local key set)", () => {
  const verify = () => createSupabaseVerifier({ issuer: ISSUER, jwks: localJwks() });

  it("accepts a valid Google access token and maps the identity", async () => {
    await expect(verify()(await token())).resolves.toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      email: "owner@example.com",
      emailVerified: true,
      provider: "google",
      name: "Owner Person",
      avatarUrl: "https://lh3.googleusercontent.com/x",
      via: "header",
    });
  });

  it.each([
    ["a foreign issuer", () => token({}, { issuer: "https://evil.supabase.co/auth/v1" })],
    ["the anon audience", () => token({}, { audience: "anon" })],
    ["an expired token", () => token({}, { expiresIn: Math.floor(Date.now() / 1000) - 60 })],
    ["another key's signature", () => token({}, { key: otherKey })],
    ["no subject", async () => {
      const unsigned = await token();
      const [, payload] = unsigned.split(".");
      const claims = JSON.parse(Buffer.from(payload!, "base64url").toString()) as Record<string, unknown>;
      delete claims.sub;
      return new SignJWT(claims).setProtectedHeader({ alg: "ES256", kid: "test-key" }).sign(privateKey);
    }],
    ["alg none", async () => {
      const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
      const body = Buffer.from(JSON.stringify({ sub: "x", iss: ISSUER, aud: "authenticated", exp: 9_999_999_999 })).toString("base64url");
      return `${header}.${body}.`;
    }],
    ["garbage", async () => "not-a-jwt"],
  ])("rejects %s", async (_label, make) => {
    await expect(verify()(await make())).rejects.toBeInstanceOf(TokenRejectedError);
  });

  it("verifies legacy HS256 projects only when SUPABASE_JWT_SECRET is set", async () => {
    const secret = "super-secret-jwt-token-with-at-least-32-characters";
    const hs = await new SignJWT({ email: "a@example.com", app_metadata: { provider: "google" } })
      .setProtectedHeader({ alg: "HS256" }).setSubject("hs-user").setIssuer(ISSUER).setAudience("authenticated")
      .setExpirationTime("1h").sign(new TextEncoder().encode(secret));
    await expect(createSupabaseVerifier({ issuer: ISSUER, jwks: localJwks() })(hs)).rejects.toBeInstanceOf(TokenRejectedError);
    await expect(createSupabaseVerifier({ issuer: ISSUER, jwks: localJwks(), jwtSecret: secret })(hs))
      .resolves.toMatchObject({ id: "hs-user", email: "a@example.com" });
    await expect(createSupabaseVerifier({ issuer: ISSUER, jwks: localJwks(), jwtSecret: "wrong-secret-wrong-secret-wrong-secret" })(hs))
      .rejects.toBeInstanceOf(TokenRejectedError);
  });
});

function manifest(overrides: Partial<SceneManifest> = {}): SceneManifest {
  return {
    ...createEmptyManifest({ levelId: "", name: "A world", seed: "seed-1", movementConfigId: "default-v1" }),
    ...overrides,
  };
}

describe("signed-in API over HTTP", () => {
  let dir: string;
  let close: (() => Promise<void>) | undefined;
  beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "wanderkin-auth-")); });
  afterEach(async () => { await close?.(); close = undefined; rmSync(dir, { recursive: true, force: true }); });

  async function start(env: Record<string, string>): Promise<{ url: string; store: LevelStore; publications: PublicationStore; config: AuthConfig }> {
    const config = resolveAuthConfig(env);
    const runtime = createAuthRuntime(dir, config, { jwks: localJwks() });
    const store = new LevelStore(dir, new AssetStore(dir), new PhotoStore(dir));
    const publications = new PublicationStore(dir);
    const security = new OwnerSecurity(dir, config.mode === "off", false, config.mode === "off" ? undefined : runtime.legacy);
    const app = express();
    app.use(express.json());
    installAuth(app, runtime);
    app.get("/api/health", (_req, res) => { res.json({ status: "ok" }); });
    app.use(createLevelsRouter(store, publications, security));
    const listener = app.listen(0);
    await new Promise<void>((resolve) => listener.once("listening", resolve));
    close = () => new Promise<void>((resolve) => listener.close(() => resolve()));
    return { url: `http://127.0.0.1:${(listener.address() as AddressInfo).port}`, store, publications, config };
  }

  const json = (headers: Record<string, string> = {}) => ({ "Content-Type": "application/json", ...headers });

  it("stub mode: sign-in opens the dashboard data; signed-out gets 401; public routes stay open", async () => {
    const { url } = await start({});
    expect((await fetch(`${url}/api/health`)).status).toBe(200);
    expect(await (await fetch(`${url}/api/auth/config`)).json()).toMatchObject({ mode: "stub" });

    const anonymous = await fetch(`${url}/api/levels`);
    expect(anonymous.status).toBe(401);
    expect(await anonymous.json()).toMatchObject({ code: "auth_required" });

    const session = await fetch(`${url}/api/auth/session`, { method: "POST", headers: DEV });
    expect(session.status).toBe(200);
    expect(await session.json()).toMatchObject({ mode: "stub", user: { id: "local-dev", provider: "stub" }, legacyOwner: true });
    const cookie = session.headers.get("set-cookie")!;
    expect(cookie).toMatch(/^wk_session=dev%3Alocal-dev; Path=\/api; HttpOnly; SameSite=Lax; Max-Age=\d+$/);

    expect((await fetch(`${url}/api/levels`, { headers: DEV })).status).toBe(200);
    // The media cookie works for reads...
    expect((await fetch(`${url}/api/levels`, { headers: { cookie: "wk_session=dev%3Alocal-dev" } })).status).toBe(200);
    // ...but never on its own for a mutation (CSRF): 403.
    const csrf = await fetch(`${url}/api/levels`, {
      method: "POST", headers: json({ cookie: "wk_session=dev%3Alocal-dev" }), body: JSON.stringify(manifest()),
    });
    expect(csrf.status).toBe(403);
    expect(await csrf.json()).toMatchObject({ code: "auth_header_required" });

    // A share link is public even signed out (unknown id: 404, not 401).
    expect((await fetch(`${url}/api/shares/0b0e0b0e-0000-4000-8000-000000000000`)).status).toBe(404);

    const signOut = await fetch(`${url}/api/auth/session`, { method: "DELETE" });
    expect(signOut.status).toBe(204);
    expect(signOut.headers.get("set-cookie")).toMatch(/^wk_session=; Path=\/api; HttpOnly; SameSite=Lax; Max-Age=0$/);
  });

  it("stub mode: the dev user owns worlds made before sign-in, virtually, without writing anything", async () => {
    const { url, store } = await start({});
    const legacy = await store.create(manifest({ levelId: "legacy-world", name: "Photo world" }));
    const listed = await (await fetch(`${url}/api/levels`, { headers: DEV })).json() as SceneManifest[];
    expect(listed.map((level) => level.levelId)).toEqual([legacy.levelId]);
    expect((await fetch(`${url}/api/levels/${legacy.levelId}`, { headers: DEV })).status).toBe(200);
    expect(() => readFileSync(join(dir, "accounts.json"))).toThrow();
    expect(() => readFileSync(join(dir, "ownership.json"))).toThrow();
  });

  it("stub is refused when NODE_ENV=production: gated routes fail closed with 503, dev header gets nothing", async () => {
    const { url, config } = await start({ NODE_ENV: "production", WANDERKIN_AUTH_MODE: "stub" });
    expect(config.mode).toBe("unconfigured");
    const response = await fetch(`${url}/api/levels`, { headers: DEV });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "auth_unconfigured" });
    expect((await fetch(`${url}/api/auth/session`, { method: "POST", headers: DEV })).status).toBe(503);
    expect((await fetch(`${url}/api/health`)).status).toBe(200);
  });

  it("production with Supabase: the dev header is rejected (401), a real token works", async () => {
    const { url } = await start({ NODE_ENV: "production", SUPABASE_URL });
    const stub = await fetch(`${url}/api/levels`, { headers: DEV });
    expect(stub.status).toBe(401);
    expect(await stub.json()).toMatchObject({ code: "auth_invalid" });
    expect((await fetch(`${url}/api/levels`, { headers: { Authorization: `Bearer ${await token()}` } })).status).toBe(200);
    const session = await fetch(`${url}/api/auth/session`, { method: "POST", headers: { Authorization: `Bearer ${await token()}` } });
    expect(session.headers.get("set-cookie")).toMatch(/; Secure$/);
  });

  it("supabase mode: worlds are private per account, invalid tokens get 401, other users get 404", async () => {
    const { url } = await start({ SUPABASE_URL });
    const alice = { Authorization: `Bearer ${await token({ email: "alice@example.com" }, { sub: "alice" })}` };
    const bob = { Authorization: `Bearer ${await token({ email: "bob@example.com" }, { sub: "bob" })}` };

    expect((await fetch(`${url}/api/levels`, { headers: { Authorization: "Bearer nope" } })).status).toBe(401);
    expect((await fetch(`${url}/api/levels`, { headers: { Authorization: `Bearer ${await token({}, { expiresIn: 1 })}x` } })).status).toBe(401);

    const created = await fetch(`${url}/api/levels`, { method: "POST", headers: json(alice), body: JSON.stringify(manifest()) });
    expect(created.status).toBe(201);
    const world = await created.json() as SceneManifest;

    expect((await (await fetch(`${url}/api/levels`, { headers: alice })).json() as SceneManifest[]).map((l) => l.levelId)).toEqual([world.levelId]);
    expect(await (await fetch(`${url}/api/levels`, { headers: bob })).json()).toEqual([]);
    expect((await fetch(`${url}/api/levels/${world.levelId}`, { headers: bob })).status).toBe(404);
    expect((await fetch(`${url}/api/levels/${world.levelId}`, {
      method: "PUT", headers: json(bob), body: JSON.stringify({ ...world, name: "Stolen" }),
    })).status).toBe(404);
    expect((await fetch(`${url}/api/levels/${world.levelId}/export`, { headers: bob })).status).toBe(404);
    expect((await fetch(`${url}/api/levels/${world.levelId}`, { headers: alice })).status).toBe(200);
    // The claim is recorded for the signed-in account.
    expect(JSON.parse(readFileSync(join(dir, "ownership.json"), "utf-8"))[`level:${world.levelId}`]).toEqual(["user:alice"]);
    // A dev header means nothing once real sign-in is on.
    expect((await fetch(`${url}/api/levels`, { headers: DEV })).status).toBe(401);
  });

  it("supabase mode: the legacy email claims pre-sign-in and stub-made worlds on first sign-in, bound by id", async () => {
    const { url, store } = await start({ SUPABASE_URL, WANDERKIN_LEGACY_OWNER_EMAIL: "Owner@Example.com" });
    const legacy = await store.create(manifest({ levelId: "legacy-world" }));
    const stubMade = await store.create(manifest({ levelId: "stub-world" }));
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(dir, "ownership.json"), JSON.stringify({ "level:stub-world": ["user:local-dev"] }));

    const stranger = { Authorization: `Bearer ${await token({ email: "someone@example.com" }, { sub: "stranger" })}` };
    expect(await (await fetch(`${url}/api/levels`, { headers: stranger })).json()).toEqual([]);
    const unverified = { Authorization: `Bearer ${await token({
      email: "owner@example.com", app_metadata: { provider: "email" }, user_metadata: { email_verified: false },
    }, { sub: "imposter" })}` };
    expect(await (await fetch(`${url}/api/levels`, { headers: unverified })).json()).toEqual([]);

    const owner = { Authorization: `Bearer ${await token({ email: "owner@example.com" }, { sub: "owner-id" })}` };
    const session = await fetch(`${url}/api/auth/session`, { method: "POST", headers: owner });
    expect(await session.json()).toMatchObject({ mode: "supabase", legacyOwner: true, user: { id: "owner-id", provider: "google" } });
    expect(JSON.parse(readFileSync(join(dir, "accounts.json"), "utf-8")).legacyClaim).toMatchObject({ userId: "owner-id", email: "owner@example.com" });

    const listed = await (await fetch(`${url}/api/levels`, { headers: owner })).json() as SceneManifest[];
    expect(listed.map((level) => level.levelId).sort()).toEqual([legacy.levelId, stubMade.levelId].sort());

    // Bound by id: a second account with the same (verified) email can't take them.
    const twin = { Authorization: `Bearer ${await token({ email: "owner@example.com" }, { sub: "twin-id" })}` };
    expect(await (await fetch(`${url}/api/levels`, { headers: twin })).json()).toEqual([]);
  });

  it("the media cookie carries a real token for reads, capped at the token's expiry", async () => {
    const { url } = await start({ SUPABASE_URL });
    const jwt = await token({}, { sub: "cookie-user" });
    const session = await fetch(`${url}/api/auth/session`, { method: "POST", headers: { Authorization: `Bearer ${jwt}` } });
    const maxAge = Number(/Max-Age=(\d+)/.exec(session.headers.get("set-cookie")!)![1]);
    expect(maxAge).toBeGreaterThan(3_500);
    expect(maxAge).toBeLessThanOrEqual(3_600);
    expect((await fetch(`${url}/api/levels`, { headers: { cookie: `wk_session=${jwt}` } })).status).toBe(200);
    // A cookie can't mint a new cookie.
    expect((await fetch(`${url}/api/auth/session`, { method: "POST", headers: { cookie: `wk_session=${jwt}` } })).status).toBe(403);
  });

  it("off mode (non-production only) keeps the old anonymous behaviour for the legacy e2e suite", async () => {
    const { url } = await start({ WANDERKIN_AUTH_MODE: "off" });
    expect((await fetch(`${url}/api/levels`)).status).toBe(200);
  });
});
