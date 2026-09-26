/**
 * Ducking: the music bed dips under the collect sound so a pickup is never
 * lost under a loud generated soundtrack. Pure envelope maths; the engine
 * applies it to a gain stage after the music bus, so the Music slider keeps
 * its meaning.
 */

/** -6 dB. */
export const DUCK_GAIN = 0.5;
/** setTargetAtTime time constants: ~95% of the way after three of them. */
export const DUCK_ATTACK_SECONDS = 0.012;
export const DUCK_RELEASE_SECONDS = 0.06;
export const MIN_DUCK_HOLD_SECONDS = 0.3;

export interface DuckStep {
  value: number;
  at: number;
  timeConstant: number;
}

interface SampleSource {
  length: number;
  numberOfChannels: number;
  sampleRate: number;
  getChannelData(channel: number): Float32Array;
}

/** Seconds from the start of a cue to the end of its loud part (the last
 * sample within 20 dB of its peak), so the duck covers a sparkle that comes
 * after a quiet rise; never less than MIN_DUCK_HOLD_SECONDS. */
export function loudSeconds(buffer: SampleSource): number {
  let peak = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    for (const value of buffer.getChannelData(channel)) peak = Math.max(peak, Math.abs(value));
  }
  let last = 0;
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let index = data.length - 1; index > last; index -= 1) {
      if (Math.abs(data[index]!) >= peak * 0.1) { last = index; break; }
    }
  }
  return Math.max(MIN_DUCK_HOLD_SECONDS, peak > 0 ? last / buffer.sampleRate : 0);
}

/** Down to DUCK_GAIN at `now`, back to full at `holdUntil`. */
export function duckSchedule(now: number, holdUntil: number): DuckStep[] {
  return [
    { value: DUCK_GAIN, at: now, timeConstant: DUCK_ATTACK_SECONDS },
    { value: 1, at: Math.max(now, holdUntil), timeConstant: DUCK_RELEASE_SECONDS },
  ];
}

/** The gain the schedule gives at `time` (Web Audio setTargetAtTime curves). */
export function duckGainAt(steps: readonly DuckStep[], time: number, start: number): number {
  let value = start;
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index]!;
    if (time <= step.at) break;
    const end = Math.min(time, steps[index + 1]?.at ?? Infinity);
    value = step.value + (value - step.value) * Math.exp(-(end - step.at) / step.timeConstant);
  }
  return value;
}
