import type { SceneManifest, StyleId } from "@shared/index.js";
import { BRAND_NAME } from "../brand.js";

export const WORLD_CAPTURE_WIDTH = 1280;
export const WORLD_CAPTURE_HEIGHT = 720;

const STYLE_BACKDROPS: Record<StyleId, readonly [string, string, string]> = {
  cartoon: ["#fff4cf", "#cfeeff", "#ff6f61"],
  "hand-painted": ["#f8e5cb", "#b9c89b", "#7c4f3d"],
  watercolor: ["#f4eefb", "#cce7e8", "#755d9a"],
};

export interface WorldScreenshot {
  blob: Blob;
  width: typeof WORLD_CAPTURE_WIDTH;
  height: typeof WORLD_CAPTURE_HEIGHT;
  mimeType: "image/png";
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("The browser could not encode the world screenshot."));
    }, "image/png");
  });
}

function coverRect(source: HTMLCanvasElement, width: number, height: number) {
  const sourceRatio = source.width / source.height;
  const targetRatio = width / height;
  if (sourceRatio > targetRatio) {
    const cropWidth = source.height * targetRatio;
    return { sx: (source.width - cropWidth) / 2, sy: 0, sw: cropWidth, sh: source.height };
  }
  const cropHeight = source.width / targetRatio;
  return { sx: 0, sy: (source.height - cropHeight) / 2, sw: source.width, sh: cropHeight };
}

/**
 * Captures the last fully rendered WebGL frame into a stable postcard frame.
 * GameView opts into preserveDrawingBuffer, so this readback does not depend
 * on the browser retaining an implementation-specific back buffer.
 */
export async function captureWorldScreenshot(
  source: HTMLCanvasElement,
  manifest: SceneManifest,
): Promise<WorldScreenshot> {
  if (source.width < 1 || source.height < 1) {
    throw new Error("The world has not rendered a frame yet.");
  }
  const output = document.createElement("canvas");
  output.width = WORLD_CAPTURE_WIDTH;
  output.height = WORLD_CAPTURE_HEIGHT;
  const context = output.getContext("2d");
  if (!context) throw new Error("This browser cannot compose a world screenshot.");

  const styleId = manifest.experience?.style.id ?? "cartoon";
  const [top, bottom, accent] = STYLE_BACKDROPS[styleId];
  const gradient = context.createLinearGradient(0, 0, output.width, output.height);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  context.fillStyle = gradient;
  context.fillRect(0, 0, output.width, output.height);

  const frame = { x: 42, y: 42, width: 1196, height: 636, radius: 28 };
  context.save();
  context.beginPath();
  context.roundRect(frame.x, frame.y, frame.width, frame.height, frame.radius);
  context.clip();
  const crop = coverRect(source, frame.width, frame.height);
  context.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, frame.x, frame.y, frame.width, frame.height);
  const shade = context.createLinearGradient(0, 410, 0, 678);
  shade.addColorStop(0, "rgba(8, 13, 24, 0)");
  shade.addColorStop(1, "rgba(8, 13, 24, 0.82)");
  context.fillStyle = shade;
  context.fillRect(frame.x, frame.y, frame.width, frame.height);
  context.restore();

  context.strokeStyle = "rgba(255,255,255,.82)";
  context.lineWidth = 4;
  context.beginPath();
  context.roundRect(frame.x, frame.y, frame.width, frame.height, frame.radius);
  context.stroke();

  context.fillStyle = "#ffffff";
  context.font = "700 42px system-ui, sans-serif";
  context.fillText(manifest.name.slice(0, 52), 82, 603, 920);
  context.font = "600 19px system-ui, sans-serif";
  context.fillStyle = "rgba(255,255,255,.82)";
  const atmosphere = manifest.experience?.style.atmosphere?.trim();
  const detail = [styleId.replace("-", " "), atmosphere].filter(Boolean).join(" · ");
  context.fillText(detail.slice(0, 90), 84, 640, 920);

  context.fillStyle = accent;
  context.beginPath();
  context.roundRect(1030, 575, 162, 58, 29);
  context.fill();
  context.fillStyle = "#ffffff";
  context.font = "800 17px system-ui, sans-serif";
  context.textAlign = "center";
  context.fillText(BRAND_NAME.toUpperCase(), 1111, 611);

  return {
    blob: await canvasToBlob(output),
    width: WORLD_CAPTURE_WIDTH,
    height: WORLD_CAPTURE_HEIGHT,
    mimeType: "image/png",
  };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The world screenshot could not be read."));
    reader.onload = () => {
      const value = reader.result;
      if (typeof value !== "string") reject(new Error("The world screenshot could not be encoded."));
      else resolve(value.slice(value.indexOf(",") + 1));
    };
    reader.readAsDataURL(blob);
  });
}
