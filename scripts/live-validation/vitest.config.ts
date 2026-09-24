import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["scripts/live-validation/**/*.test.ts"],
    environment: "node",
  },
});
