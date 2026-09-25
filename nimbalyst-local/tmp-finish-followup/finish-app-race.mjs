// Real-App regression for reviewer finding F-1 (stale Save & share navigation).
// Adapted from the reviewer's tmp-final-opus-review/finish-app.mjs S5, which is
// left untouched. It loads the REAL App through vite.app.config.mjs and drives
// App's own `screen` state through its useState dispatch, found via the React
// fiber. The real onSaveAndShare, go() and FinishScreen run. Every /api write
// is mocked, delayed on purpose and counted. Foreign hosts are blocked.
//   npx vite --config vite.app.config.mjs   (127.0.0.1:5261), then: node finish-app-race.mjs
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const port = Number(process.env.OQ_FINISH_APP_PORT ?? 5261);
const base = `http://127.0.0.1:${port}`;
const outDir = path.join(here, "evidence", "app-race");
mkdirSync(outDir, { recursive: true });
const log = [];
const note = (...a) => { const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "); console.log(s); log.push(s); };
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok }); note(`${ok ? "PASS" : "FAIL"} ${name}`, detail ?? ""); };

const plan = { createDelay: 0, publishDelay: 0 };
let writes = [];
let publishCount = 0;
const blocked = [];
const errors = [];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.route("**/*", async (route) => {
  const req = route.request();
  const url = new URL(req.url());
  if (url.host !== `127.0.0.1:${port}`) { blocked.push(req.url()); return route.abort(); }
  if (!url.pathname.startsWith("/api/")) return route.continue();
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  if (req.method() === "GET") {
    if (url.pathname === "/api/levels") return route.fulfill({ status: 200, contentType: "application/json", body: "[]" });
    if (url.pathname.startsWith("/api/postcards/")) return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ state: "none", cacheHit: false }) });
    return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: "mocked-404" }) });
  }
  const body = req.postDataJSON?.() ?? null;
  if (req.method() === "POST" && url.pathname === "/api/levels") {
    writes.push({ kind: "create", levelId: body?.levelId });
    await delay(plan.createDelay);
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ...body, levelId: `saved-${body.levelId}` }) });
  }
  const publish = url.pathname.match(/^\/api\/levels\/([^/]+)\/publish$/);
  if (req.method() === "POST" && publish) {
    publishCount += 1;
    writes.push({ kind: "publish", levelId: decodeURIComponent(publish[1]) });
    await delay(plan.publishDelay);
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ shareId: `mock-share-${publishCount}`, levelId: decodeURIComponent(publish[1]), versionId: `v${publishCount}` }) });
  }
  writes.push({ kind: "UNEXPECTED", method: req.method(), path: url.pathname });
  return route.abort();
});

const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
await page.goto(`${base}/`);
await page.waitForTimeout(1500);
await page.evaluate(async () => {
  const root = document.getElementById("root");
  const key = Object.keys(root).find((k) => k.startsWith("__reactContainer$"));
  const stack = [root[key]];
  let app = null;
  while (stack.length) { const f = stack.pop(); if (f.type && f.type.name === "App") { app = f; break; } if (f.sibling) stack.push(f.sibling); if (f.child) stack.push(f.child); }
  let hook = app.memoizedState, dispatch = null, stateHook = null;
  while (hook) { const s = hook.memoizedState; if (hook.queue && s && typeof s === "object" && typeof s.name === "string") { dispatch = hook.queue.dispatch; stateHook = hook; break; } hook = hook.next; }
  if (!dispatch) throw new Error("screen dispatch not found");
  const samples = await import("/src/scene/samples.ts");
  const jobs = await import("/src/ui/jobStorage.ts");
  const sample = samples.SAMPLE_LEVELS[0];
  const media = { screenshot: null, highlight: null, screenshotError: null, recordingError: null, recordingSupported: false };
  const result = { mode: "legacy", elapsedMilliseconds: 42000, bestMilliseconds: null, publishedVersionId: null };
  window.__oq = {
    set: (screen) => dispatch(screen),
    // The live App screen, read from the hook itself (its current fiber's state).
    // The live App screen: the hook queue is shared by both fibers.
    current: () => stateHook.queue.lastRenderedState,
    draftFinish: (id) => { const d = { ...structuredClone(sample), levelId: id, name: "My own draft" }; return { name: "finish", manifest: d, result, media, publishable: false, unsaved: { kind: "draft", manifest: d } }; },
    // What PlayScreen's onComplete does in App: carry the play screen's own `unsaved` object.
    completeFrom: (play) => ({ name: "finish", manifest: play.manifest, result, media, publishable: false, unsaved: play.unsaved }),
    jobs,
  };
});

const reset = () => { writes = []; publishCount = 0; };
const wait = (ms) => page.waitForTimeout(ms);
const view = () => page.evaluate(() => ({
  path: location.pathname,
  historyLength: history.length,
  finish: Boolean(document.querySelector(".oq-finish")),
  start: !document.querySelector(".oq-finish") && !document.querySelector("canvas"),
  link: document.querySelector(".oq-finish [role=status] a")?.getAttribute("href") ?? null,
  share: [...document.querySelectorAll("button")].find((b) => /Share this world|Publishing…|Copy share link again/.test(b.textContent))?.textContent.trim() ?? null,
  save: Boolean([...document.querySelectorAll("button")].find((b) => /Save & share/.test(b.textContent))),
}));
// Reach Finish the way App does: via go(), so the URL/history match (push onto "/").
async function enterFinish(id) {
  await page.evaluate(() => window.__oq.set({ name: "start" }));
  await wait(300);
  await page.evaluate((i) => {
    const s = window.__oq.draftFinish(i);
    history.pushState(null, "", `/finish/${encodeURIComponent(s.manifest.levelId)}`);
    window.__oq.set(s);
  }, id);
  await wait(400);
}
const saveShare = () => page.getByRole("button", { name: /Save & share this world/ });

try {
  // A: F-1 exactly (reviewer S5). Leave via Play again while the save is pending,
  // and start a newer creation's recovery record meanwhile.
  reset(); Object.assign(plan, { createDelay: 1500, publishDelay: 100 });
  await enterFinish("race-a");
  await saveShare().click();
  await wait(200);
  await page.getByRole("button", { name: /Play again/ }).click();
  await wait(300);
  await page.evaluate(() => window.__oq.jobs.saveActiveSource({ kind: "import", assetId: "newer-creation-asset" }));
  const before = await view();
  await wait(2200);
  const after = await view();
  const activeAfter = await page.evaluate(() => window.__oq.jobs.loadActiveSource());
  await page.screenshot({ path: path.join(outDir, "a-replay-not-yanked.png") });
  check("A stays in replay (no yank back to Finish)", !after.finish && after.path === before.path && after.path.startsWith("/play/"), { before, after });
  check("A no history rewrite", after.historyLength === before.historyLength && after.path === before.path);
  check("A the explicit publish still completed once, one save", JSON.stringify(writes.map((w) => w.kind)) === '["create","publish"]', writes);
  check("A newer creation's active source not cleared", activeAfter?.assetId === "newer-creation-asset", activeAfter);
  await page.evaluate(() => window.__oq.jobs.clearActiveSource());

  // A2: that replay finishes; the new Finish for the SAME draft must not save again.
  reset(); Object.assign(plan, { createDelay: 0, publishDelay: 100 });
  await page.evaluate(() => { const play = window.__oq.current(); window.__oq.set(window.__oq.completeFrom(play)); });
  await wait(400);
  const a2 = await view();
  check("A2 later Finish of the saved draft offers plain Share, no Save & share", a2.finish && !a2.save && a2.share === "Share this world", a2);
  await page.getByRole("button", { name: "Share this world", exact: true }).click();
  await wait(500);
  check("A2 shares the stored copy: publish only, no second create", JSON.stringify(writes) === JSON.stringify([{ kind: "publish", levelId: "saved-race-a" }]), writes);

  // B: leave via the browser's Back button while the save is pending.
  reset(); Object.assign(plan, { createDelay: 1200, publishDelay: 100 });
  await enterFinish("race-b");
  await saveShare().click();
  await wait(200);
  await page.goBack();
  await wait(300);
  const bBefore = await view();
  await wait(1800);
  const bAfter = await view();
  check("B Back lands on Start and stays there after the save lands", bAfter.path === "/" && !bAfter.finish && bBefore.path === "/", { bBefore, bAfter });
  check("B one save, one publish", JSON.stringify(writes.map((w) => w.kind)) === '["create","publish"]', writes);

  // C: control. Stay on Finish; the normal mid-flight swap still happens and the link shows.
  reset(); Object.assign(plan, { createDelay: 300, publishDelay: 600 });
  await enterFinish("race-c");
  const cBefore = await view();
  await saveShare().click();
  await wait(550);
  const cMid = await view();
  await wait(900);
  const cAfter = await view();
  await page.screenshot({ path: path.join(outDir, "c-stayed-link-shown.png") });
  check("C still-current swap: Publishing… locked mid-flight", cMid.share === "Publishing…", cMid);
  check("C link shown, URL replaced in place (same history length)", Boolean(cAfter.link) && cAfter.path === "/finish/saved-race-c" && cAfter.historyLength === cBefore.historyLength, { cBefore, cAfter });
  check("C one save, one publish of the saved id", JSON.stringify(writes) === JSON.stringify([{ kind: "create", levelId: "race-c" }, { kind: "publish", levelId: "saved-race-c" }]), writes);
} catch (error) {
  check("harness ran without throwing", false, String(error?.stack ?? error));
  await page.screenshot({ path: path.join(outDir, "zz-error.png") }).catch(() => {});
} finally {
  note("[unexpected writes]", writes.filter((w) => w.kind === "UNEXPECTED"));
  note("[console errors]", errors);
  note("[blocked]", blocked);
  const failed = results.filter((r) => !r.ok).length;
  note(`SUMMARY ${results.length - failed}/${results.length} passed`);
  await context.close();
  await browser.close();
  writeFileSync(path.join(outDir, "log.txt"), log.join("\n"));
  process.exitCode = failed ? 1 : 0;
}
