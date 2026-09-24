# ObjectQuest v1 baseline verification — 2026-09-24

Baseline revision: `e857d24318aae616691c07b986b1c89ff9bdff21`
(`docs: record final ObjectQuest acceptance`). Verification ran from the
isolated Worker 10 worktree after `npm ci`; no product source was changed.
Wall durations below were measured around each command in PowerShell. Runner
durations are included where the tool reported them.

## Results

| Gate | Exit | Result | Measured wall time | Runner detail |
| --- | ---: | --- | ---: | --- |
| `npm run typecheck` | 0 | Passed | 11.886 s | Client and server TypeScript checks passed. |
| `npm run build` | 0 | Passed | 29.074 s | Vite built 689 modules in 7.41 s; server TypeScript emit passed. |
| `npm test` | 0 | 253 passed, 0 failed in 29 files | 7.132 s | Vitest duration 5.90 s. |
| `npm run test:e2e:http` | 0 | 24 passed, 0 failed in 5 files | 7.879 s | Vitest duration 7.10 s. |
| `npm run test:e2e:browser` | 1 | No tests started | 1.461 s | Playwright refused to start because `127.0.0.1:5174` was already in use. |
| Browser diagnostic on port 5184 | 0 | 5 passed, 1 skipped, 0 failed | 56.737 s | Playwright duration 55.2 s; the generated-GLB case skipped because `OBJECTQUEST_GENERATED_GLB_PATH` was unset. |

The browser diagnostic used an exact temporary copy of the repository
Playwright config with only port `5174` replaced by `5184` and the temporary
output-directory name changed. The temporary config was removed immediately
after the run. It is diagnostic evidence, not a claim that the exact npm
command passed.

## Comparison with `docs/QA.md`

| Recorded claim | Baseline observation | Assessment |
| --- | --- | --- |
| 253 unit/headless tests | 253/253 passed across 29 files | Matches. |
| 24 HTTP integration tests | 24/24 passed across 5 files | Matches. |
| 6 browser cases | The suite contains 6 cases. With no generated artifact path, 5 passed and 1 skipped on the alternate port. | Consistent with the detailed QA wording, which says all 6 require `OBJECTQUEST_GENERATED_GLB_PATH`; the default command is documented as 5 repository-contained passes plus 1 skip. The headline six-pass result was not reproduced in this environment. |
| Typecheck and build pass | Both passed. | Matches. |

## Findings and root causes

- The exact browser command was blocked by local infrastructure contention,
  not a test assertion or missing browser binary. Port 5174 was owned by PID
  8268, a `node.exe` Vite process whose command line pointed at the main
  checkout. An HTTP probe returned ObjectQuest with status 200. The process
  was not stopped or modified.
- The installed Chrome channel launched successfully on port 5184, proving
  that the browser prerequisite was present.
- The sixth browser case requires a previously generated local GLB through
  `OBJECTQUEST_GENERATED_GLB_PATH`. That variable was absent from the Worker 10
  process, so the test's explicit skip behaved as designed. No provider call
  was made and no artifact path was inferred from another checkout.
- The build repeated typecheck and emitted the documented non-fatal warning
  for chunks larger than 500 kB. The largest emitted chunk was
  `rapier.es-CmnDU9Yz.js` at 2,058.23 kB (761.59 kB gzip).
- Unit tests emitted four non-fatal `THREE.GLTFLoader` texture warnings for
  Node `blob:nodedata:` URLs; all affected tests passed.
- During browser startup, Vite logged transient `/api/levels` proxy
  `ECONNREFUSED` messages before the isolated API-backed UI cases ran; the five
  executable browser cases still passed.
- A `.env` file is present in the main checkout. Presence only was checked;
  its contents were not read or printed.

## Scope and limitations

This run verifies the requested baseline revision only. It does not validate a
real Livepeer request, the visual quality of arbitrary generated geometry, or
the optional generated-GLB browser scenario. The worktree was returned to
branch `worktree/pure-nebula` at tip `e783045` before this report was written.
