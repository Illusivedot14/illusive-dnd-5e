import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Foundry globals are installed manually per-test (see test/helpers.mjs); a
    // plain node environment is enough since the module reads globals at call time.
    environment: "node",
    globals: false,
    setupFiles: ["./test/setup.mjs"],
    include: ["test/**/*.test.mjs"]
  }
});
