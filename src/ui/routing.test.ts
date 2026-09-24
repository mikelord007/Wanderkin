import { afterEach, describe, expect, it, vi } from "vitest";
import {
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
