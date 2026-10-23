import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    testTimeout: 30_000,
    server: { deps: { inline: ["convex-test"] } },
    coverage: { provider: "v8", reporter: ["text", "lcov"], include: ["src/**/*.ts"], exclude: ["src/**/_generated/**", "src/test.ts"] },
  },
});
