import { mkdir, writeFile } from "node:fs/promises";

const RATE = 8000;
const MUSIC_RATE = 22050;
const outDir = new URL("../public/audio/", import.meta.url);
await mkdir(outDir, { recursive: true });

function wav(seconds, sample, rate = RATE) {
  const count = Math.floor(rate * seconds);
  const bytes = Buffer.alloc(44 + count * 2);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(36 + count * 2, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i += 1) bytes.writeInt16LE(Math.max(-32767, Math.min(32767, sample(i / rate, i, count))) | 0, 44 + i * 2);
  return bytes;
}

const tone = (frequency, t, gain = 1) => Math.sin(Math.PI * 2 * frequency * t) * gain;
const envelope = (i, count, attack = .02, release = .18, rate = RATE) => Math.min(1, i / (rate * attack), (count - i) / (rate * release));
const seedNoise = (i) => (((Math.imul(i + 17, 1103515245) + 12345) >>> 16) / 32768 - 1);

/** Short plucked/mallet note: fast attack, exponential decay, brighter fast-decaying 2nd
 * harmonic for a bell-like "ping" — deliberately no sustained tone, so notes leave silence
 * between them instead of blending into a drone. */
function pluck(frequency, localT, decay) {
  const fundamental = Math.sin(Math.PI * 2 * frequency * localT) * Math.exp(-decay * localT);
  const overtone = Math.sin(Math.PI * 2 * frequency * 2 * localT) * Math.exp(-decay * 3 * localT) * .22;
  return fundamental + overtone;
}

const files = new Map([
  ["lost-colors-loop.wav", wav(4, (t, i, count) => {
    // Bright C-major-pentatonic phrase (C4 E4 G4 C5 A4 G4 E4 D4), plucked mallet-style,
    // with a light plucked bass and a soft percussion tap. Friendly/playful, no sustained
    // drone or tremolo — replaces the earlier sine-drone-plus-tremolo cue that read as ominous.
    const melodyNotes = [261.63, 329.63, 392, 523.25, 440, 392, 329.63, 293.66];
    const bassNotes = [130.81, 196];
    const noteDuration = .5;
    const noteIndex = Math.floor(t / noteDuration);
    const localT = t - noteIndex * noteDuration;
    // The playback engine (src/audio/engine.ts trimAndNormalize + fixed loopStart) always
    // restarts each loop iteration ~10ms after the buffer's first audible sample, no matter
    // how that sample is shaped. Note 0 therefore opens with true silence for 80ms and then
    // a slow ~120ms fade-in, so the content sitting at that fixed loop-in point is still
    // quiet — every note after it keeps the normal crisp 3ms pluck attack.
    const leadSilence = noteIndex === 0 ? .15 : 0;
    const attackDuration = noteIndex === 0 ? .22 : .003;
    const sinceOnset = localT - leadSilence;
    const attack = sinceOnset <= 0 ? 0 : Math.min(1, sinceOnset / attackDuration);
    const onsetT = Math.max(0, sinceOnset);

    const melody = pluck(melodyNotes[noteIndex % melodyNotes.length], onsetT, 7.5) * attack * .45;

    let bass = 0;
    if (noteIndex % 2 === 0) {
      const bassFrequency = bassNotes[Math.floor(noteIndex / 2) % bassNotes.length];
      bass = pluck(bassFrequency, onsetT, 4) * attack * .22;
    }

    const percussion = noteIndex === 0 ? 0 : seedNoise(i) * Math.exp(-60 * localT) * attack * .05;

    return (melody + bass + percussion) * envelope(i, count, .03, .06, MUSIC_RATE) * 32767;
  }, MUSIC_RATE)],
  ["gentle-breeze.wav", wav(4, (t, i, count) => seedNoise(i) * (.06 + .025 * Math.sin(Math.PI * 2 * .2 * t)) * envelope(i, count, .25, .25) * 32767)],
  ["fragment-pickup.wav", wav(.45, (t, i, count) => (tone(660 + t * 500, t, .42) + tone(990 + t * 250, t, .18)) * envelope(i, count, .01, .2) * 32767)],
  ["portal-activate.wav", wav(1.2, (t, i, count) => (tone(220 + t * 360, t, .26) + tone(440 + t * 520, t, .16)) * envelope(i, count, .04, .32) * 32767)],
  ["checkpoint.wav", wav(.35, (t, i, count) => tone(t < .16 ? 523.25 : 783.99, t, .45) * envelope(i, count, .01, .12) * 32767)],
  ["fall-respawn.wav", wav(.75, (t, i, count) => (tone(460 - t * 300, t, .28) + seedNoise(i) * .05) * envelope(i, count, .01, .18) * 32767)],
  ["race-start.wav", wav(1.15, (t, i, count) => tone(t < .35 ? 440 : t < .7 ? 440 : 880, t, .42) * envelope(i % Math.floor(RATE * .38), Math.floor(RATE * .38), .01, .1) * 32767)],
  ["race-finish.wav", wav(1.5, (t, i, count) => tone([523.25, 659.25, 783.99, 1046.5][Math.min(3, Math.floor(t / .3))], t, .38) * envelope(i, count, .02, .28) * 32767)],
  ["completion.wav", wav(1.8, (t, i, count) => (tone(392, t, .2) + tone(523.25, t, .18) + tone(659.25, t, .16)) * envelope(i, count, .04, .45) * 32767)],
  ["narration-intro.wav", wav(1.1, (t, i, count) => (tone(440, t, .18) + tone(554.37, t, .14) + tone(659.25, t, .1)) * envelope(i, count, .08, .35) * 32767)],
]);

for (const [name, bytes] of files) await writeFile(new URL(name, outDir), bytes);
console.log(`Generated ${files.size} CC0 procedural WAV files (${RATE} Hz, music at ${MUSIC_RATE} Hz).`);
