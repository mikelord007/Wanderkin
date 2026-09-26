// Rebuilds public/audio/fragment-pickup.wav from this project's own generated
// collect sound: Mirelo SFX (mirelo-sfx, Mirelo-AI/sfx1.6/text-to-audio),
// application job job_1474ebee-fa65-4d4b-b411-0f8babbabb87, asset
// e8d567b4-7468-426f-9bff-f70e9860a522, generated 2026-09-24. It is not CC0
// and is not produced by generate-bundled-audio.mjs.
//
//   node scripts/derive-collect-sfx.mjs <path to the source 44.1 kHz WAV>
//
// The sound is unchanged: only the leading silence the game engine trims
// anyway (below 0.001, keeping its 10 ms of padding) is cut, and it is
// resampled to 32 kHz mono 16-bit. The source has no energy above 16 kHz, so
// nothing audible is lost, and the file fits the bundled-audio size limit.
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const SOURCE_SHA256 = "b79dd5c6f413025b5fe4086b2a57bb20df64ae74ad709171f6a530e430fe5092";
const OUT_RATE = 32000;
const source = process.argv[2];
if (!source) throw new Error("Pass the path of the source WAV.");

const bytes = await readFile(source);
const sha256 = createHash("sha256").update(bytes).digest("hex");
if (sha256 !== SOURCE_SHA256) throw new Error(`Source sha256 ${sha256} is not the generated collect sound ${SOURCE_SHA256}.`);

let offset = 12;
let rate = 0;
let samples = null;
while (offset + 8 <= bytes.length) {
  const id = bytes.toString("ascii", offset, offset + 4);
  const size = bytes.readUInt32LE(offset + 4);
  if (id === "fmt ") {
    if (bytes.readUInt16LE(offset + 8) !== 1 || bytes.readUInt16LE(offset + 10) !== 1 || bytes.readUInt16LE(offset + 22) !== 16) {
      throw new Error("Expected mono 16-bit PCM.");
    }
    rate = bytes.readUInt32LE(offset + 12);
  }
  if (id === "data") {
    samples = new Float64Array(size / 2);
    for (let i = 0; i < samples.length; i += 1) samples[i] = bytes.readInt16LE(offset + 8 + i * 2) / 32768;
  }
  offset += 8 + size + (size % 2);
}
if (!samples || !rate) throw new Error("No PCM data found.");

// The same trim as trimAndNormalize in src/audio/engine.ts.
let first = samples.length;
let last = 0;
samples.forEach((value, index) => { if (Math.abs(value) > 0.001) { first = Math.min(first, index); last = index; } });
const padding = Math.floor(rate * 0.01);
const trimmed = samples.subarray(Math.max(0, first - padding), Math.min(samples.length, last + padding + 1));

// Windowed-sinc resampling, low-passed just under the new Nyquist.
const ratio = rate / OUT_RATE;
const cutoff = 0.95 * Math.min(1, OUT_RATE / rate);
const halfWidth = 48;
const count = Math.floor(trimmed.length / ratio);
const out = Buffer.alloc(44 + count * 2);
out.write("RIFF", 0); out.writeUInt32LE(36 + count * 2, 4); out.write("WAVEfmt ", 8);
out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
out.writeUInt32LE(OUT_RATE, 24); out.writeUInt32LE(OUT_RATE * 2, 28); out.writeUInt16LE(2, 32);
out.writeUInt16LE(16, 34); out.write("data", 36); out.writeUInt32LE(count * 2, 40);
for (let n = 0; n < count; n += 1) {
  const center = n * ratio;
  let sum = 0;
  for (let j = Math.ceil(center - halfWidth); j <= Math.floor(center + halfWidth); j += 1) {
    if (j < 0 || j >= trimmed.length) continue;
    const x = j - center;
    const sinc = x === 0 ? 1 : Math.sin(Math.PI * cutoff * x) / (Math.PI * cutoff * x);
    const window = 0.5 + 0.5 * Math.cos(Math.PI * x / halfWidth);
    sum += trimmed[j] * cutoff * sinc * window;
  }
  out.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(sum * 32768))), 44 + n * 2);
}

await writeFile(new URL("../public/audio/fragment-pickup.wav", import.meta.url), out);
console.log(`fragment-pickup.wav: ${(count / OUT_RATE).toFixed(3)} s at ${OUT_RATE} Hz, ${out.length} bytes, sha256 ${createHash("sha256").update(out).digest("hex")}`);
