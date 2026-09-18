import { readFileSync } from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "./repoRoot.js";

const SAMPLES_DIR = join(REPO_ROOT, "public", "samples");

/** Reads a real bundled sample photo (1-5) — actual JPEG bytes, not a stub. */
export function readSamplePhoto(n: 1 | 2 | 3 | 4 | 5): Buffer {
  return readFileSync(join(SAMPLES_DIR, `photo-${n}.jpg`));
}

export function readSampleRodinGlb(): Buffer {
  return readFileSync(join(SAMPLES_DIR, "rodin.glb"));
}

export function readSampleTripoGlb(): Buffer {
  return readFileSync(join(SAMPLES_DIR, "tripo.glb"));
}

/** Smallest possible valid binary glTF: a 12-byte header with no chunks
 * (mirrors server/jobs/manager.test.ts's fixture) — satisfies
 * assertValidGlb's magic/version/declared-length checks without needing a
 * real mesh. */
export function minimalValidGlb(): Buffer {
  const buffer = Buffer.alloc(12);
  buffer.write("glTF", 0, "ascii");
  buffer.writeUInt32LE(2, 4);
  buffer.writeUInt32LE(12, 8);
  return buffer;
}

export function notAnImageOrGlb(): Buffer {
  return Buffer.from("this is plain text, not an image or a glTF binary file, and is well over 512 bytes long so it doesn't get rejected for being too small instead of for having the wrong magic bytes. ".repeat(4));
}

export function uniqueIdempotencyKey(label: string): string {
  return `qa-e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
