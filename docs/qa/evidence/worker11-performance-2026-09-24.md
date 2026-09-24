# Worker 11 performance evidence — 2026-09-24

Scope: local Chromium on this machine, the two original bundled GLB samples, and
all three gameplay styles. Each measurement starts from My worlds, waits for the
play invitation, accepts the explicit play gesture, holds `W`, and samples
`requestAnimationFrame` for 20 seconds. The local API used the repository's fake
MCP endpoint, and the test asserted that no generation capability was called.

Command:

```text
npx playwright test tests/e2e/browser/qa/performance.qa.test.ts --project=chromium
```

Result: 6 passed in 2.5 minutes.

An earlier aggregate version attempted all six 20-second samples in one test.
That run stalled and was terminated manually; its partial timings were
discarded and are not mixed into the table below. After splitting the work into
six independently bounded cases, no final case stalled and all six completed.

| Bundled sample | Style | First play invitation (ms) | Frames / 20 s | Mean frame (ms) | p95 frame (ms) | Mean FPS |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Rodin | Cartoon | 2,497.7 | 1,200 | 16.6665 | 16.8 | 60.001 |
| Rodin | Hand-painted | 2,130.8 | 1,200 | 16.6666 | 16.8 | 60.000 |
| Rodin | Watercolor | 2,104.6 | 1,200 | 16.6664 | 16.8 | 60.001 |
| Tripo | Cartoon | 1,564.7 | 1,199 | 16.6803 | 16.8 | 59.951 |
| Tripo | Hand-painted | 2,245.7 | 1,200 | 16.6663 | 16.8 | 60.001 |
| Tripo | Watercolor | 2,031.6 | 1,190 | 16.8066 | 16.8 | 59.501 |

These are observations on this machine, not a cross-device performance claim.
The historical software-rendered baseline in `docs/SCENE.md` measured
111.940–141.244 ms/frame for a different process. The current headless Chromium
run is much faster, but the environment/process difference prevents treating the
delta as a product-only improvement.

## Production build

`npm run build` passed after the quest/audio merge. Vite transformed 764 modules
in 7.47 seconds; the complete `dist` tree was 10,924,886 bytes. Largest emitted
files/chunks were:

| Asset | Raw bytes | Vite gzip (when reported) |
| --- | ---: | ---: |
| `samples/rodin.glb` | 4,979,900 | n/a |
| `assets/rapier.es-*.js` | 2,058,233 | 761.59 kB |
| `samples/tripo.glb` | 1,993,644 | n/a |
| `assets/GLTFLoader-*.js` | 728,806 | 189.00 kB |
| `assets/app-*.js` | 174,026 | 52.23 kB |
| `assets/WorldStyleScope-*.js` | 149,248 | 48.32 kB |
| `assets/react-three-fiber.esm-*.js` | 131,981 | 43.15 kB |
| `audio/lost-colors-loop.wav` | 96,044 | n/a |

The 4.98 MB Rodin sample and 2.06 MB physics chunk dominate transfer/storage.
No acceptance threshold is defined for bundle bytes, so this is reported as an
observation rather than a defect.
