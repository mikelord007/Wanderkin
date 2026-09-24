import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createNavigationGuard,
  navigateTo,
  parseRoute,
  pathForCreate,
  pathForEdit,
  pathForFinish,
  pathForGenerating,
  pathForPlay,
  pathForPrepareAsset,
  pathForPrepareNew,
  pathForSharePlay,
  pathForStart,
  pathForWorlds,
} from "./routing.js";

/** A promise plus its resolver pulled out, so a test can control exactly
 * when a simulated slow fetch (e.g. `GET /api/levels/:id`) finishes. */
function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("parseRoute", () => {
  it("recognizes every top-level screen path", () => {
    expect(parseRoute("/")).toEqual({ kind: "start" });
    expect(parseRoute("")).toEqual({ kind: "start" });
    expect(parseRoute("/worlds")).toEqual({ kind: "worlds" });
    expect(parseRoute("/create")).toEqual({ kind: "create" });
    expect(parseRoute("/create/prepare")).toEqual({ kind: "create-prepare" });
    expect(parseRoute("/create/generating/job_1")).toEqual({ kind: "create-generating", jobId: "job_1" });
    expect(parseRoute("/create/prepare/asset_1")).toEqual({ kind: "create-prepare-asset", assetId: "asset_1" });
    expect(parseRoute("/edit/level_1")).toEqual({ kind: "edit", levelId: "level_1" });
    expect(parseRoute("/play/level_1")).toEqual({ kind: "play", levelId: "level_1" });
    expect(parseRoute("/finish/level_1")).toEqual({ kind: "finish", levelId: "level_1" });
    expect(parseRoute("/share/abc-123")).toEqual({ kind: "share", shareId: "abc-123" });
    expect(parseRoute("/share/abc-123/play")).toEqual({ kind: "share-play", shareId: "abc-123" });
  });

  it("tolerates a trailing slash", () => {
    expect(parseRoute("/play/level_1/")).toEqual({ kind: "play", levelId: "level_1" });
    expect(parseRoute("/create/")).toEqual({ kind: "create" });
  });

  it("rejects unknown or malformed paths instead of guessing", () => {
    expect(parseRoute("/play/level_1/extra")).toEqual({ kind: "unknown" });
    expect(parseRoute("/api/levels/abc")).toEqual({ kind: "unknown" });
    expect(parseRoute("/nonexistent")).toEqual({ kind: "unknown" });
  });

  it("round-trips every builder through the parser", () => {
    expect(parseRoute(pathForStart())).toEqual({ kind: "start" });
    expect(parseRoute(pathForWorlds())).toEqual({ kind: "worlds" });
    expect(parseRoute(pathForCreate())).toEqual({ kind: "create" });
    expect(parseRoute(pathForPrepareNew())).toEqual({ kind: "create-prepare" });
    expect(parseRoute(pathForGenerating("job_weird-1"))).toEqual({
      kind: "create-generating",
      jobId: "job_weird-1",
    });
    expect(parseRoute(pathForPrepareAsset("asset_1"))).toEqual({
      kind: "create-prepare-asset",
      assetId: "asset_1",
    });
    expect(parseRoute(pathForEdit("level_1"))).toEqual({ kind: "edit", levelId: "level_1" });
    expect(parseRoute(pathForPlay("level_1"))).toEqual({ kind: "play", levelId: "level_1" });
    expect(parseRoute(pathForFinish("level_1"))).toEqual({ kind: "finish", levelId: "level_1" });
    expect(parseRoute(pathForSharePlay("share_1"))).toEqual({ kind: "share-play", shareId: "share_1" });
  });
});

/**
 * This suite runs under vitest's `node` environment (no real DOM), matching
 * every other unit test in this project — see e.g. inputController.test.ts
 * stubbing `document` the same way, rather than pulling in jsdom globally.
 */
function installFakeWindow(initialPath = "/") {
  let historyLength = 1;
  const url = { pathname: "", search: "", hash: "" };
  function setFromPath(path: string) {
    const [beforeHash, hash] = path.split("#");
    const [pathname, search] = (beforeHash ?? "").split("?");
    url.pathname = pathname || "/";
    url.search = search ? `?${search}` : "";
    url.hash = hash ? `#${hash}` : "";
  }
  setFromPath(initialPath);
  const fakeWindow = {
    location: {
      get pathname() {
        return url.pathname;
      },
      get search() {
        return url.search;
      },
      get hash() {
        return url.hash;
      },
    },
    history: {
      get length() {
        return historyLength;
      },
      pushState: vi.fn((_state: unknown, _title: string, path: string) => {
        historyLength += 1;
        setFromPath(path);
      }),
      replaceState: vi.fn((_state: unknown, _title: string, path: string) => {
        setFromPath(path);
      }),
    },
  };
  vi.stubGlobal("window", fakeWindow);
  return fakeWindow;
}

describe("navigateTo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("pushes a new path", () => {
    const fakeWindow = installFakeWindow();
    navigateTo("/play/level_1");
    expect(fakeWindow.location.pathname).toBe("/play/level_1");
    expect(fakeWindow.history.pushState).toHaveBeenCalledOnce();
  });

  it("replaces instead of pushing when asked", () => {
    const fakeWindow = installFakeWindow();
    navigateTo("/play/level_1");
    navigateTo("/play/level_2", true);
    expect(fakeWindow.location.pathname).toBe("/play/level_2");
    expect(fakeWindow.history.replaceState).toHaveBeenCalledOnce();
  });

  it("is a no-op when the target already matches the current URL", () => {
    const fakeWindow = installFakeWindow();
    navigateTo("/play/level_1");
    navigateTo("/play/level_1");
    expect(fakeWindow.history.pushState).toHaveBeenCalledOnce();
  });

  it("preserves an existing hash fragment instead of dropping it", () => {
    const fakeWindow = installFakeWindow("/#my-worlds");
    navigateTo("/", true);
    expect(fakeWindow.location.pathname).toBe("/");
    expect(fakeWindow.location.hash).toBe("#my-worlds");
  });
});

describe("createNavigationGuard", () => {
  it("reproduces and fixes the reported race: a slow /edit/:id fetch must not overrule a later Home navigation", async () => {
    // Mirrors App.tsx's resolveScreen()/go() integration one-to-one: begin()
    // is called at the start of every navigation attempt, and only the
    // result whose token `isCurrent` when it finally arrives may apply.
    const guard = createNavigationGuard();
    const applied: string[] = [];
    const editFetch = deferred<string>();

    // 1. User navigates to /edit/level-0ed836ff. GET /api/levels/:id is slow
    //    — this mirrors resolveEditRoute()'s pending getLevel() call.
    const editToken = guard.begin();
    const editResolution = editFetch.promise.then((screen) => {
      if (!guard.isCurrent(editToken)) return; // superseded — must be dropped
      applied.push(screen);
    });

    // 2. Before that fetch returns, the user presses Back/Home — a second,
    //    synchronous navigation (mirrors popstate resolving to "/" instantly).
    const homeToken = guard.begin();
    if (guard.isCurrent(homeToken)) applied.push("start");

    // 3. Only now does the slow /edit/:id fetch finally resolve.
    editFetch.resolve("preparation:level-0ed836ff");
    await editResolution;

    // The stale editor screen must never have been applied — the user
    // stays on the screen they actually navigated to.
    expect(applied).toEqual(["start"]);
  });

  it("drops a stale result even when it arrives before a newer one settles (out-of-order resolution)", async () => {
    const guard = createNavigationGuard();
    const applied: string[] = [];

    const firstToken = guard.begin();
    const first = deferred<string>();
    const firstResolution = first.promise.then((value) => {
      if (guard.isCurrent(firstToken)) applied.push(value);
    });

    const secondToken = guard.begin();
    const second = deferred<string>();
    const secondResolution = second.promise.then((value) => {
      if (guard.isCurrent(secondToken)) applied.push(value);
    });

    // The OLDER navigation's fetch happens to win the race and settle
    // first — it must still be ignored, because it is no longer current.
    first.resolve("stale-edit");
    await firstResolution;
    expect(applied).toEqual([]);

    second.resolve("current-play");
    await secondResolution;
    expect(applied).toEqual(["current-play"]);
  });

  it("treats a resolved fallback (e.g. a failed fetch's Start-screen fallback) the same as any other stale result", async () => {
    // resolveEditRoute/resolvePlayRoute never reject — a failed fetch
    // resolves to a fallback Screen instead. The guard must still drop it
    // once superseded, exactly like a successful stale result.
    const guard = createNavigationGuard();
    const applied: string[] = [];

    const staleToken = guard.begin();
    const fallback = deferred<string>();
    const staleResolution = fallback.promise.then((value) => {
      if (guard.isCurrent(staleToken)) applied.push(value);
    });

    const currentToken = guard.begin();
    if (guard.isCurrent(currentToken)) applied.push("current");

    fallback.resolve("start-fallback-from-failed-edit-fetch");
    await staleResolution;

    expect(applied).toEqual(["current"]);
  });

  it("keeps applying a result when nothing superseded it", async () => {
    const guard = createNavigationGuard();
    const token = guard.begin();
    const fetch = deferred<string>();
    const applied: string[] = [];

    const resolution = fetch.promise.then((value) => {
      if (guard.isCurrent(token)) applied.push(value);
    });
    fetch.resolve("play:level-1");
    await resolution;

    expect(applied).toEqual(["play:level-1"]);
  });
});
