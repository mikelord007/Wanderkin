import { defineConfig } from "vitest/config";

/**
 * Separate vitest project for HTTP route integration tests, owned by QA
 * (tests/e2e/**). Deliberately NOT merged into the root vitest.config.ts
 * (server/shared/src unit tests) — these tests spawn a real local
 * server/index.ts child process per file and are much slower than the unit
 * suite, so they're run on demand via `npm run test:e2e:http` instead of
 * on every `npm test`.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/e2e/http/**/*.test.ts"],
    hookTimeout: 30_000,
    testTimeout: 20_000,
  },
});
