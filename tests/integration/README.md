# ObjectQuest v2 integration contracts

These Vitest files are deliberately skipped executable contracts for Workers
4–8. Run them independently with:

```sh
npx vitest run --config tests/integration/vitest.config.ts
```

Each test body documents the setup, action, and externally observable
assertions required before removing `.skip`. A worker should replace the
sentinel error with calls through the real cross-feature boundary, not copy
implementation details into the test. Mocks are appropriate at provider and
clock boundaries; HTTP stores, browser persistence, and shared schemas should
use their production adapters where the contract calls for them.

Keep these distinctions visible in failures and evidence:

- one application job versus one provider submission;
- retrying an optional asset versus regenerating the mesh;
- a browser-restored pending job versus a newly submitted job;
- a private editable level versus an immutable published snapshot;
- mocked provider behavior versus a real-provider observation.
