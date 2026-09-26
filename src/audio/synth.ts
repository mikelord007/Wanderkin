/**
 * Short effects synthesised in Web Audio rather than loaded from a file.
 *
 * The grappling hook is a player ability, not level media, so its bite has
 * no manifest cue, no bundled WAV and no generated asset: it is built here
 * on the effects bus, so it follows the player's effects volume and mute
 * like every other one-shot.
 */

/** Deterministic noise, so the bite sounds the same every time. */
function fillNoise(data: Float32Array): void {
  let seed = 0x2f6b1c3d;
  for (let i = 0; i < data.length; i += 1) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    // Short and bright: the click decays across the buffer itself.
    data[i] = ((seed / 0xffffffff) * 2 - 1) * (1 - i / data.length);
  }
}

/** Seconds from the start of the bite until its last node stops. */
export const GRAPPLE_BITE_SECONDS = 0.18;

/**
 * The hook biting: a bright metallic click (band-passed noise) over a quick
 * falling "thunk", about a sixth of a second long.
 */
export function playGrappleBite(context: BaseAudioContext, destination: AudioNode, when = context.currentTime): void {
  const noise = context.createBuffer(1, Math.max(1, Math.ceil(context.sampleRate * 0.045)), context.sampleRate);
  fillNoise(noise.getChannelData(0));
  const click = context.createBufferSource();
  click.buffer = noise;
  const band = context.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = 3400;
  band.Q.value = 3;
  const clickGain = context.createGain();
  clickGain.gain.setValueAtTime(0.55, when);
  clickGain.gain.exponentialRampToValueAtTime(0.001, when + 0.05);
  click.connect(band);
  band.connect(clickGain);
  clickGain.connect(destination);
  click.start(when);
  click.stop(when + 0.06);

  const thunk = context.createOscillator();
  thunk.type = "triangle";
  thunk.frequency.setValueAtTime(460, when);
  thunk.frequency.exponentialRampToValueAtTime(130, when + 0.12);
  const thunkGain = context.createGain();
  thunkGain.gain.setValueAtTime(0.0001, when);
  thunkGain.gain.linearRampToValueAtTime(0.4, when + 0.006);
  thunkGain.gain.exponentialRampToValueAtTime(0.0001, when + GRAPPLE_BITE_SECONDS - 0.02);
  thunk.connect(thunkGain);
  thunkGain.connect(destination);
  thunk.start(when);
  thunk.stop(when + GRAPPLE_BITE_SECONDS);
}
