# Worker 11 accessibility and audio evidence — 2026-09-24

## Phase-2 audio result

After merging audio integration `b46573e` into this branch, the repository B14
contract passed in Chrome (`1 passed`, 9.7 seconds). The stricter independent
test then ran in both headless and headed Chrome.

Verified working:

- the first audio/subtitle attempt occurs only after the keyboard-activated
  **Play** gesture;
- the narration subtitle appears, times out, and does not return after manual
  respawn or **Restart course**;
- **Sound** and **Mute sound** are keyboard reachable and show a visible solid
  focus outline;
- Master, Music, Effects, and Voice sliders have accessible labels;
- `ArrowLeft` on the focused Music slider changes `50` to `49` and does not
  move the player;
- mute and channel settings persist in `objectquest:audio-settings:v1`;
- `prefers-reduced-motion: reduce` is observed by the browser;
- no paid-provider call occurs.

Screenshot: [audio controls, subtitle, and reduced motion](artifacts/audio-accessibility/audio-controls-subtitles-reduced-motion.png).

Not working: both headed and headless Chrome recorded **zero** requests for
`/audio/*.wav` after the explicit Play gesture. The subtitle and all controls
still rendered, and the browser emitted no page or console error. Therefore
the current UI-level B14 contract is a false positive for actual playback;
bundled Lost Colors music/effects/narration were not delivered on this machine.
The independent test intentionally remains failing at the network assertion.

## Contrast spot checks

The HUD uses the same foreground/background treatment across all three scene
styles, so contrast does not depend on the 3D palette:

| Surface | Colours / conservative composite | WCAG contrast |
| --- | --- | ---: |
| Subtitle | `#fffdf8` on opaque `#282536` | 14.67:1 |
| HUD objective | `#f4f7fb` on the worst-case white composite of `rgba(13,17,25,.62)` (`#696b70`) | 4.96:1 |
| Primary orange HUD control | `#24160c` on `#ff8a4c` | 7.52:1 |

All three spot checks exceed 4.5:1 for normal text. The objective panel is
translucent, but the conservative calculation uses a brighter backing than
the captured Cartoon, Hand-painted, or Watercolor scenes.
