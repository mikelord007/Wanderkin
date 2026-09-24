import { defineConfig } from "vitest/config";
import path from "node:path";

const repositoryRoot = path.resolve(__dirname, "../..");

export default defineConfig({
  root: repositoryRoot,
  test: {
    environment: "node",
    include: ["tests/integration/**/*.contract.test.ts"],
  },
  resolve: {
    alias: {
      "@shared": path.resolve(repositoryRoot, "shared"),
    },
  },
});
