// Bounded REAL-App check of the e83f8b1 Finish share state (not a mirror).
// Loads the real App through Vite (vite.final.config.mjs, OQ_VARIANT=after,
// nothing pinned), then drives App's own `screen` state (its useState
// dispatch, found through the React fiber) straight into Finish screens, so
// the real onSaveAndShare / go() / FinishScreen code runs without a course
// playthrough. Every write is mocked and counted; foreign hosts are blocked.
//   node finish-app.mjs            (server on 127.0.0.1:5243)
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const here = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));
const port = 5243;
const base = `http://127.0.0.1:${port}`;
const outDir = path.join(here, "shots", "finish-app-f1");
mkdirSync(outDir, { recursive: true });
const log = [];
const note = (...a) => { const s = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" "); console.log(s); log.push(s); };

const plan = { createDelay: 0, publishDelay: 0, publishFailures: 0 };
let writes = [];
const blocked = [];
const errors = [];
let publishCount = 0;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: base });
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
    writes.push({ kind: "create", levelId: body?.levelId, mode: body?.experience?.mode?.kind ?? null, t: Date.now() });
    await delay(plan.createDelay);
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ ...body, levelId: body.levelId }) });
  }
  const publish = url.pathname.match(/^\/api\/levels\/([^/]+)\/publish$/);
  if (req.method() === "POST" && publish) {
    publishCount += 1;
    writes.push({ kind: "publish", levelId: decodeURIComponent(publish[1]), challenge: body?.challenge?.kind, t: Date.now() });
    await delay(plan.publishDelay);
    if (publishCount <= plan.publishFailures) return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ message: "Mock publish failure" }) });
    return route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ shareId: `mock-share-${publishCount}`, levelId: decodeURIComponent(publish[1]), versionId: `v${publishCount}` }) });
  }
  // Anything else that writes is not expected: abort and record it.
  writes.push({ kind: "UNEXPECTED", method: req.method(), path: url.pathname });
  return route.abort();
});

const page = await context.newPage();
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

await page.goto(`${base}/`);
await page.waitForTimeout(1500);
// Hook the real App's `screen` state dispatch and expose fixtures built from real modules.
await page.evaluate(async () => {
  const root = document.getElementById("root");
  const key = Object.keys(root).find((k) => k.startsWith("__reactContainer$"));
  const stack = [root[key]];
  let app = null;
  while (stack.length) { const f = stack.pop(); if (f.type && f.type.name === "App") { app = f; break; } if (f.sibling) stack.push(f.sibling); if (f.child) stack.push(f.child); }
  let hook = app.memoizedState, dispatch = null;
  while (hook) { const s = hook.memoizedState; if (hook.queue && s && typeof s === "object" && typeof s.name === "string") { dispatch = hook.queue.dispatch; break; } hook = hook.next; }
  if (!dispatch) throw new Error("screen dispatch not found");
  const samples = await import("/src/scene/samples.ts");
  const race = await import("/src/game/modes/raceVariant.ts");
  const sample = samples.SAMPLE_LEVELS[0];
  const media = { screenshot: null, highlight: null, screenshotError: null, recordingError: null, recordingSupported: false };
  window.__oqFinish = {
    set: (screen) => dispatch(screen),
    sample, media,
    draft: (id) => ({ ...structuredClone(sample), levelId: id, name: "My own draft" }),
    race: race.createRaceVariant,
  };
});

const shareButton = () => page.getByRole("button", { name: /Share this world|Publishing…|Copy share link again/ });
const saveShare = () => page.getByRole("button", { name: /Save & share this world|Saving & publishing…/ });
async function state(label) {
  const s = await page.evaluate(() => {
    const share = [...document.querySelectorAll("button")].find((b) => /Share this world|Publishing…|Copy share link again/.test(b.textContent));
    const save = [...document.querySelectorAll("button")].find((b) => /Save & share|Saving & publishing/.test(b.textContent));
    return {
      path: location.pathname,
      finish: Boolean(document.querySelector(".oq-finish")),
      canvas: Boolean(document.querySelector("canvas")),
      share: share ? { text: share.textContent.trim(), disabled: share.disabled, describedBy: share.getAttribute("aria-describedby") } : null,
      save: save ? { text: save.textContent.trim(), disabled: save.disabled } : null,
      reason: document.getElementById("finish-share-reason")?.textContent ?? null,
      error: document.querySelector(".oq-finish [role=alert]")?.textContent ?? null,
      link: document.querySelector(".oq-finish [role=status] a")?.getAttribute("href") ?? null,
    };
  });
  note(`[${label}]`, s);
  return s;
}
const reset = () => { writes = []; publishCount = 0; };
// Real runs always reach Finish from Play (a different screen), so unmount the
// previous Finish first; otherwise React would keep its state across scenarios.
const finish = async (fields) => {
  await page.evaluate(() => window.__oqFinish.set({ name: "start" }));
  await page.waitForTimeout(300);
  await finishNow(fields);
};
const finishNow = (fields) => page.evaluate((f) => {
  const F = window.__oqFinish;
  const result = f.race ? { mode: "race", elapsedMilliseconds: 41000, bestMilliseconds: 41000, publishedVersionId: null } : { mode: "legacy", elapsedMilliseconds: 42000, bestMilliseconds: null, publishedVersionId: null };
  let screen;
  if (f.kind === "sample") screen = { name: "finish", manifest: F.sample, result, media: F.media, publishable: false, unsaved: { kind: "sample" } };
  else if (f.kind === "published") screen = { name: "finish", manifest: F.sample, result, media: F.media, publishable: false, publication: { shareId: "existing-share-7", levelId: F.sample.levelId, versionId: "v7" } };
  else { const d = F.draft(f.id); screen = { name: "finish", manifest: f.race ? F.race(d) : d, result, media: F.media, publishable: false, unsaved: { kind: "draft", manifest: d } }; }
  F.set(screen);
}, fields);

try {
  // S1 unchanged.
  reset(); Object.assign(plan, { createDelay: 500, publishDelay: 900, publishFailures: 1 });
  await finish({ kind: 'draft', id: 'review-draft-1' }); await page.waitForTimeout(400);
  await saveShare().dblclick();
  await saveShare().click({ force: true, timeout: 500 }).catch(() => {});
  await page.waitForTimeout(950);
  const s1mid = await state('S1 publish in flight');
  await page.waitForTimeout(1200);
  await state('S1 after failure');
  plan.publishDelay = 200;
  await shareButton().click();
  await page.waitForTimeout(800);
  const s1end = await state('S1 after retry');
  note('[S1 writes]', writes, { locked: s1mid.share?.disabled && s1mid.share?.text === 'Publishing…', linkShown: Boolean(s1end.link) });

  // S5 original repro: Play again while the save is pending, plus a newer creation's active source set mid-save.
  reset(); Object.assign(plan, { createDelay: 1500, publishDelay: 100, publishFailures: 0 });
  await page.evaluate(() => localStorage.setItem('objectquest:activeSource', JSON.stringify({ kind: 'import', assetId: 'old-draft-asset' })));
  await finish({ kind: 'draft', id: 'review-draft-5' }); await page.waitForTimeout(400);
  await saveShare().click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: /Play again/ }).click();
  await page.waitForTimeout(300);
  const h5 = await page.evaluate(() => history.length);
  await page.evaluate(() => localStorage.setItem('objectquest:activeSource', JSON.stringify({ kind: 'import', assetId: 'NEWER-creation-asset' })));
  const s5a = await state('S5 replaying while save pending');
  await page.waitForTimeout(2200);
  const s5b = await state('S5 after save landed');
  const s5src = await page.evaluate(() => localStorage.getItem('objectquest:activeSource'));
  const h5b = await page.evaluate(() => history.length);
  await page.screenshot({ path: path.join(outDir, 'f1-s5-stays-in-replay.png') });
  note('[S5 writes]', writes, { yankedBackToFinish: s5b.finish, stayedOn: s5b.path, sameHistoryLength: h5 === h5b, newerSourceKept: s5src });

  // S6 browser Back while the save is pending (old-draft source unchanged -> should be cleared as in normal save).
  reset(); Object.assign(plan, { createDelay: 1500, publishDelay: 100, publishFailures: 0 });
  await page.evaluate(() => localStorage.setItem('objectquest:activeSource', JSON.stringify({ kind: 'import', assetId: 'old-draft-asset-6' })));
  await finish({ kind: 'draft', id: 'review-draft-6' });
  await page.evaluate(() => history.pushState(null, '', '/finish/review-draft-6'));
  await page.waitForTimeout(400);
  await saveShare().click();
  await page.waitForTimeout(200);
  await page.goBack();
  await page.waitForTimeout(400);
  const s6a = await state('S6 after Back, save pending');
  await page.waitForTimeout(2200);
  const s6b = await state('S6 after save landed');
  const s6src = await page.evaluate(() => localStorage.getItem('objectquest:activeSource'));
  note('[S6 writes]', writes, { yankedBackToFinish: s6b.finish, pathBefore: s6a.path, pathAfter: s6b.path, unchangedOldSourceCleared: s6src === null });
} catch (error) {
  note("[error]", String(error?.stack ?? error));
  await page.screenshot({ path: path.join(outDir, "zz-error.png") }).catch(() => {});
} finally {
  note("[console errors]", errors);
  note("[blocked]", blocked);
  await context.close();
  await browser.close();
  writeFileSync(path.join(outDir, "log.txt"), log.join("\n"));
}
