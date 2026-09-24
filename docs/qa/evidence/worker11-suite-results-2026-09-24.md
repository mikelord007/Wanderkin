# Worker 11 browser suite evidence — 2026-09-24

## Environment

- Branch: `worktree/broad-hollow`
- Revision: `e7cac8e59d261222743a0a6fd9f76ce2c9cf93bb`
- Browser: installed Chrome channel, headless, Playwright `1.63.0`
- Viewport: repository default `1280 × 720`
- Server: a new loopback high port selected by the operating system for each run
- Install: `npm ci` completed; npm reported 5 dependency advisories (3 moderate,
  1 high, 1 critical)
- Generated GLB input: not supplied, so the optional generated-artifact UI case
  skipped as designed

## Two full-suite runs

| Run | Result | Passed | Failed | Skipped | Duration | Failure evidence |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| 1 | Failed | 19 | 1 | 9 | 5.1 min | `%TEMP%/objectquest-w11-run1/ui-photo-lightbox-follows--d6973-right-Escape-keyboard-input/` |
| 2 | Failed | 19 | 1 | 9 | 5.2 min | `%TEMP%/objectquest-w11-run2/ui-photo-lightbox-follows--d6973-right-Escape-keyboard-input/` |

No test changed status between runs, so no flakes were observed.

## Per-file result

| Test file | Run 1 | Run 2 | Independent observation |
| --- | --- | --- | --- |
| `creation-walkthrough.test.ts` | 1 passed | 1 passed | Mocked screens 2–7 walkthrough completed. |
| `gameplay.test.ts` | 2 passed | 2 passed | Both original Rodin and Tripo samples completed and replayed with keyboard/mouse input. |
| `objectquest-v2.acceptance.test.ts` | 12 passed, 8 skipped | 12 passed, 8 skipped | B5, B6, B8–B13, B15, B18, and both B19 cases passed; contract stubs B1–B4, B7, B14, B16, and B17 skipped. |
| `ui.test.ts` | 2 passed, 1 failed, 1 skipped | 2 passed, 1 failed, 1 skipped | Lightbox test timed out waiting for obsolete heading `Add your photos`; the product displays `What will your world be made of?`. Editor and portable export/import passed. Generated-GLB case skipped without `OBJECTQUEST_GENERATED_GLB_PATH`. |
| `worker5-gameplay.acceptance.test.ts` | 2 passed | 2 passed | Lost Colors/respawn/restart/Race and Explore/no-timer passed with real movement input. |

## B1–B19 result from the full suite

“Covered elsewhere” means the named contract test is skipped but a separate
real-browser test exercises material parts of that scenario. It is not counted
as a pass for the skipped contract test.

| ID | Run 1 | Run 2 | Evidence / limitation |
| --- | --- | --- | --- |
| B1 | Contract skipped; covered elsewhere | Same | `gameplay.test.ts` completed and replayed both original samples. |
| B2 | Contract skipped; covered elsewhere | Same | Worker 5 test completed Lost Colors, but did not capture/quantify 0/1/2/3 restoration frames. |
| B3 | Skipped | Skipped | No three-style screenshot or histogram comparison in the existing suite. |
| B4 | Contract skipped; partial coverage elsewhere | Same | Worker 5 covered Collect, Race, and Explore behavior, but the contract case remains skipped. |
| B5 | Passed | Passed | Upload/review/crop path with routed API mocks. |
| B6 | Passed | Passed | Explicit preview approval and one matching 3D request. |
| B7 | Contract skipped; partial coverage elsewhere | Same | Worker 5 checked Collect respawn/restart and Race results; stale-timer/best-time persistence needs dedicated evidence. |
| B8 | Passed | Passed | Browser editor entity persistence case. |
| B9 | Passed | Passed | Browser saved-world style/mission/audio-reference reload case. |
| B10 | Passed | Passed | Seeded pending creation resumed after refresh with routed API mock. |
| B11 | Passed | Passed | Induced optional music failure left course preparation enabled. |
| B12 | Passed | Passed | Separate browser context opened the immutable publication. |
| B13 | Passed | Passed | Separate context retained publication version and target after private edit. |
| B14 | Skipped | Skipped | Awaiting audio integration and dedicated accessibility evidence. |
| B15 | Passed | Passed | Camera denial and corrupt-image rejection; oversized path not covered by the existing case. |
| B16 | Skipped | Skipped | Worker 8 gameplay capture pending. |
| B17 | Skipped | Skipped | Worker 8 postcard flow and live provider evidence pending. |
| B18 | Passed | Passed | Routed network counter observed no generation POST during replay. |
| B19 | Passed (2 cases) | Passed (2 cases) | Seeded saved/draft/pending/retryable-failed/terminal-failed states. |

## Repeated suite failure

`ui.test.ts:37` is stale relative to the integrated creation journey. After
clicking **Create my world**, the test waits for a heading named **Add your
photos**. The current, product-brief-aligned screen instead renders **What will
your world be made of?**, so the test waits until the global 120-second timeout
in both runs. The failure screenshot shows a usable capture/upload screen; this
is test drift rather than evidence that entry to creation is broken. Per the
Worker 11 constraints, the pre-existing test was not edited.
