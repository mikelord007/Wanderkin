import React from "react";
import ReactDOM from "react-dom/client";
import type { StyleId } from "../../shared/style.js";
import { GameView } from "../../src/game/GameView.js";
import { getSampleLevel } from "../../src/scene/samples.js";

declare global {
  interface Window {
    __STYLE_PREVIEW_READY__?: boolean;
  }
}

const params = new URLSearchParams(location.search);
const sample = params.get("sample") ?? "sample-rodin-room-corner";
const style = (params.get("style") ?? "cartoon") as StyleId;
const restoration = Number(params.get("restoration") ?? "1");
const atmosphere = params.get("atmosphere") ?? undefined;
const manifest = getSampleLevel(sample);
if (!manifest) throw new Error(`Unknown sample ${sample}`);

ReactDOM.createRoot(document.querySelector("#root")!).render(
  <React.StrictMode>
    <GameView
      manifest={manifest}
      styleId={style}
      {...(atmosphere ? { atmosphere } : {})}
      colorRestoration={restoration}
      onExit={() => undefined}
      onComplete={() => undefined}
      onProgress={(snapshot) => {
        window.__STYLE_PREVIEW_READY__ = snapshot.ready;
      }}
    />
  </React.StrictMode>,
);
