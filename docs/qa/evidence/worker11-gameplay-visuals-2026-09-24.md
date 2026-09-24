# Worker 11 gameplay visual evidence — 2026-09-24

Command (isolated Vite high port, isolated real API storage, local fake provider):

```text
npx playwright test tests/e2e/browser/qa/gameplay-visuals.qa.test.ts \
  --config tests/e2e/browser/playwright.config.ts --reporter=line
```

Result: **2 passed in 49.1 seconds**. The browser's `/api` traffic was
forwarded to a real `server/index.ts` process on an OS-assigned loopback port.
The fake provider received zero `run_capability` calls.

## B2 — Lost Colors

The browser used keyboard input to collect the three authored fragments, with
respawn after each pickup to return the camera to a consistent starting view.
It observed `Colors found` progress `0/3 → 1/3 → 2/3 → 3/3`, the visible
`portal is awake` state, entered the portal with movement input, and reached
the `You brought the colors back.` completion screen.

Mean HSV saturation was calculated from every fourth screenshot pixel by
decoding the Playwright PNG inside the browser. Higher values represent more
colour in the rendered gameplay canvas.

| Fragments | Mean saturation | Screenshot |
| ---: | ---: | --- |
| 0 | 0.131896 | [lost-colors-0.png](artifacts/gameplay-visuals/qa-gameplay-visuals.qa-B2--4e8b0-ompletes-through-the-portal/lost-colors-0.png) |
| 1 | 0.300141 | [lost-colors-1.png](artifacts/gameplay-visuals/qa-gameplay-visuals.qa-B2--4e8b0-ompletes-through-the-portal/lost-colors-1.png) |
| 2 | 0.343783 | [lost-colors-2.png](artifacts/gameplay-visuals/qa-gameplay-visuals.qa-B2--4e8b0-ompletes-through-the-portal/lost-colors-2.png) |
| 3 | 0.354766 | [lost-colors-3.png](artifacts/gameplay-visuals/qa-gameplay-visuals.qa-B2--4e8b0-ompletes-through-the-portal/lost-colors-3.png) |

The measurements are strictly monotonic for this repeatable view. Completion
evidence: [lost-colors-completion.png](artifacts/gameplay-visuals/qa-gameplay-visuals.qa-B2--4e8b0-ompletes-through-the-portal/lost-colors-completion.png).

## B3 — three gameplay styles

Three saved manifests used the same Lost Colors geometry, camera start, and
fully restored colour state. Only `experience.style.id` differed. Each was
saved through the real local API, opened from My worlds, and rendered in the
actual gameplay canvas.

- [Cartoon gameplay](artifacts/gameplay-visuals/qa-gameplay-visuals.qa-B3--c0362-ce-distinct-gameplay-pixels/style-cartoon.png)
- [Hand-painted gameplay](artifacts/gameplay-visuals/qa-gameplay-visuals.qa-B3--c0362-ce-distinct-gameplay-pixels/style-hand-painted.png)
- [Watercolor gameplay](artifacts/gameplay-visuals/qa-gameplay-visuals.qa-B3--c0362-ce-distinct-gameplay-pixels/style-watercolor.png)

Normalized 64-bin RGB histogram distance (`0` identical, `1` disjoint):

| Pair | Distance |
| --- | ---: |
| Cartoon ↔ Hand-painted | 0.783615 |
| Cartoon ↔ Watercolor | 0.843377 |
| Hand-painted ↔ Watercolor | 0.642405 |

All pairs exceeded the test's conservative `0.03` distinctness threshold by
more than twenty times. This is evidence of materially different gameplay
rendering, not merely different labels or preview cards.
