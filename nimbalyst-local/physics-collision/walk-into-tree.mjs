// Headless Chromium gate for solid biome props: for each themed look on one
// bundled sample, aim the character at the nearest trunk it has a clear line
// to, hold W, and check the capsule stops against it (position delta ≈ 0)
// with no page errors. Setup mirrors tmp-biome-integration/perf.mjs (API
// mocked in memory, no provider calls) and env-upgrade/harness/perf.mjs (look
// switch via the picker's onBiomeChange for looks the picker does not list).
//   OQ_BIOME_PORT=16491 node walk-into-tree.mjs [sampleIndex]
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const port = Number(process.env.OQ_BIOME_PORT ?? 16491);
if ([5173, 8787, 15173, 18799].includes(port)) throw new Error(`protected port ${port}`);
const base = `http://127.0.0.1:${port}`;
const sampleIndex = Number(process.argv[2] ?? 0);
const LOOKS = (process.env.OQ_LOOKS ?? "tropical,desert,alpine,autumn,ember").split(",").filter(Boolean);
const outDir = path.join(here, "walk", `sample-${sampleIndex}`);
mkdirSync(outDir, { recursive: true });
const log = [];
const note = (...a) => { const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "); console.log(s); log.push(s); };

const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--window-size=1280,860"] });
const context = await browser.newContext({ viewport: { width: 1280, height: 780 } });
await context.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.host !== `127.0.0.1:${port}`) return route.abort();
  if (!url.pathname.startsWith("/api/")) return route.continue();
  if (route.request().method() === "GET" && url.pathname === "/api/levels") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
  return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
});
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", (error) => pageErrors.push(String(error?.stack ?? error)));
page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
const diag = () => page.evaluate(() => window.__objectquest?.get() ?? null);
async function waitFor(fn, label, timeout = 60000) {
  const start = Date.now();
  for (;;) { const v = await fn().catch(() => null); if (v) return v; if (Date.now() - start > timeout) throw new Error(`timeout ${label}`); await page.waitForTimeout(200); }
}
async function openSettings() {
  await page.keyboard.press("Escape");
  await waitFor(() => page.locator(".oq-hud__card h2", { hasText: "Paused" }).isVisible(), "paused");
  if (!(await page.evaluate(() => document.querySelector(".oq-hud__settings")?.open))) await page.locator(".oq-hud__settings > summary").click();
}
async function resume() {
  await page.locator(".oq-hud__settings > summary").click();
  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await page.waitForTimeout(800);
}
async function look(id) {
  await openSettings();
  const option = page.locator(`.oq-adventure__option[data-theme=${id}]`);
  if (await option.count()) await option.first().click();
  else if (!(await page.evaluate((themeId) => {
    const el = document.querySelector(".oq-adventure");
    const key = el && Object.keys(el).find((k) => k.startsWith("__reactFiber$"));
    for (let f = key ? el[key] : null; f; f = f.return) if (typeof f.memoizedProps?.onBiomeChange === "function") { f.memoizedProps.onBiomeChange(themeId); return true; }
    return false;
  }, id))) throw new Error(`no look control for ${id}`);
  await waitFor(async () => (await page.evaluate(() => !document.querySelector(".oq-adventure[aria-busy=true]"))) && (await diag())?.biome?.id === id, id);
  await resume();
}

/** Locates the live GameStage props (simulation + input) through the React fiber tree. Read-only use plus `input.setYaw`, the same call a respawn makes. */
const STAGE = `(() => {
  // GameStage renders inside the R3F Canvas (its own React root), so look for
  // its element among the Canvas's children props rather than DOM fibers.
  const isStage = (p) => p && p.simulation && p.input && typeof p.input.setYaw === "function";
  const scan = (node, depth) => {
    if (!node || depth > 12) return null;
    if (Array.isArray(node)) { for (const n of node) { const r = scan(n, depth + 1); if (r) return r; } return null; }
    if (typeof node !== "object" || !node.props) return null;
    if (isStage(node.props)) return node.props;
    return scan(node.props.children, depth + 1);
  };
  const root = document.getElementById("root");
  const key = Object.keys(root).find((k) => k.startsWith("__reactContainer$"));
  const stack = [root[key]];
  while (stack.length) {
    const f = stack.pop();
    const p = f.memoizedProps;
    if (isStage(p)) return p;
    const found = p && scan(p.children, 0);
    if (found) return found;
    if (f.sibling) stack.push(f.sibling);
    if (f.child) stack.push(f.child);
  }
  return null;
})()`;

/** Nearest round prop with a clear capsule sweep from the player, walls first. */
async function pickTrunk() {
  return page.evaluate((stageSource) => {
    const stage = eval(stageSource);
    const sim = stage.simulation;
    const world = sim.scene.world;
    const me = sim.playerPosition;
    const { characterRadius: r, characterHalfHeight: hh } = sim.config;
    const feet = me.y - hh - r;
    const shape = sim.scene.playerCollider.shape;
    const candidates = [];
    world.colliders.forEach((c) => {
      const members = c.collisionGroups() >>> 16;
      if (members !== 0x0002 && members !== 0x0004) return;
      const type = c.shapeType();
      if (type !== 2 && type !== 10) return; // capsule, cylinder
      const t = c.translation();
      const s = c.shape;
      const bottom = type === 2 ? t.y - s.halfHeight : t.y - s.halfHeight;
      if (Math.abs(bottom - feet) > 0.06) return;
      const dx = t.x - me.x;
      const dz = t.z - me.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 0.15 || distance > 6) return;
      candidates.push({ handle: c.handle, x: t.x, z: t.z, radius: s.radius, wall: members === 0x0004, distance, dx, dz });
    });
    candidates.sort((a, b) => (Number(b.wall) - Number(a.wall)) || a.distance - b.distance);
    for (const c of candidates) {
      const hit = world.castShape({ x: me.x, y: me.y + 0.01, z: me.z }, { x: 0, y: 0, z: 0, w: 1 }, { x: c.dx, y: 0, z: c.dz }, shape, 0, 1, true, undefined, undefined, sim.scene.playerCollider);
      // Far props are disabled until the player is near (propColliders.ts),
      // so a sweep that reaches the trunk unobstructed may report no hit.
      if (!hit || hit.collider.handle === c.handle) {
        stage.input.setYaw(Math.atan2(c.dx, c.dz));
        return { ...c, candidates: candidates.length };
      }
    }
    return { none: true, candidates: candidates.length };
  }, STAGE);
}

const results = [];
try {
  await page.goto(`${base}/`);
  await page.waitForTimeout(1500);
  await page.evaluate(async (index) => {
    const root = document.getElementById("root");
    const key = Object.keys(root).find((k) => k.startsWith("__reactContainer$"));
    const stack = [root[key]]; let app = null;
    while (stack.length) { const f = stack.pop(); if (f.type && f.type.name === "App") { app = f; break; } if (f.sibling) stack.push(f.sibling); if (f.child) stack.push(f.child); }
    let hook = app.memoizedState, dispatch = null;
    while (hook) { const s = hook.memoizedState; if (hook.queue && s && typeof s === "object" && typeof s.name === "string") { dispatch = hook.queue.dispatch; break; } hook = hook.next; }
    const samples = await import("/src/scene/samples.ts");
    dispatch({ name: "play", manifest: samples.SAMPLE_LEVELS[index], publishable: false, unsaved: { kind: "sample" } });
  }, sampleIndex);
  await waitFor(() => page.getByRole("button", { name: "Play", exact: true }).isVisible(), "ready", 120000);
  await page.getByRole("button", { name: "Play", exact: true }).click();
  await page.waitForTimeout(1500);
  note("[original]", { propColliders: (await diag())?.biome?.propColliders ?? null });

  for (const id of LOOKS) {
    await look(id);
    // Back to the spawn, so each look starts from open ground.
    await page.keyboard.press("KeyR");
    await page.waitForTimeout(600);
    const before = await diag();
    const target = await pickTrunk();
    if (target.none) {
      note(`[${id}]`, { error: "no round prop with a clear line", candidates: target.candidates, propColliders: before.biome.propColliders });
      results.push({ id, ok: false });
      continue;
    }
    await page.waitForTimeout(300);
    // Hold W for enough SIMULATED time to reach the trunk and then push on it
    // for 1.5 s. Headless rendering is slow and the simulation only catches up
    // four fixed steps per frame, so wall-clock holds would be too short.
    const need = target.distance / 2.2 + 1.5;
    const samples = [];
    const t0 = before.simulatedSeconds;
    await page.keyboard.down("KeyW");
    const wallStart = Date.now();
    for (;;) {
      const d = await diag();
      samples.push({ t: d.simulatedSeconds - t0, p: d.playerPosition, speed: d.measuredSpeed });
      if (d.simulatedSeconds - t0 >= need || Date.now() - wallStart > 180000) break;
      await page.waitForTimeout(40);
    }
    await page.screenshot({ path: path.join(outDir, `${id}-against-trunk.png`) });
    await page.keyboard.up("KeyW");
    const simulated = samples.at(-1).t;
    const last = samples.filter((s) => s.t >= simulated - 1);
    const xs = last.map((s) => s.p[0]);
    const zs = last.map((s) => s.p[2]);
    const delta = Math.hypot(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
    const end = samples.at(-1).p;
    const gap = Math.hypot(end[0] - target.x, end[2] - target.z);
    const expected = target.radius + 0.045;
    const ok = delta < 0.002 && Math.abs(gap - expected) < 0.012;
    results.push({ id, ok });
    note(`[${id}]`, {
      ok, trunk: { wall: target.wall, radius: +target.radius.toFixed(4), distance: +target.distance.toFixed(3) },
      propColliders: before.biome.propColliders, deferred: before.biome.propCollidersDeferred,
      lastSecondDeltaM: +delta.toFixed(5), axisGapM: +gap.toFixed(4), expectedGapM: +expected.toFixed(4),
      finalSpeed: +samples.at(-1).speed.toFixed(4), samples: samples.length, simulatedS: +simulated.toFixed(2), lastSecondSamples: last.length,
    });
    writeFileSync(path.join(outDir, `${id}-trace.json`), JSON.stringify({ target, samples }, null, 1));
  }
  await look("original");
  note("[original-again]", { propColliders: (await diag())?.biome?.propColliders ?? null });
} catch (error) {
  note("[error]", String(error?.stack ?? error));
  results.push({ id: "run", ok: false });
} finally {
  note("[page errors]", pageErrors.length, pageErrors.slice(0, 5));
  note("[console errors]", consoleErrors.length, consoleErrors.slice(0, 5));
  note("[verdict]", results.every((r) => r.ok) && pageErrors.length === 0 ? "PASS" : "FAIL", results);
  await context.close(); await browser.close();
  writeFileSync(path.join(outDir, "log.txt"), log.join("\n"));
}
