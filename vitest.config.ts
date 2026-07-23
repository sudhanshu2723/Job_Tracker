import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Node-environment unit tests for the pure security/logic layer.
// `server-only` is stubbed so server modules (auth) import without the
// react-server condition that vitest doesn't set.
export default defineConfig({
  resolve: {
    alias: {
      "server-only": fileURLToPath(new URL("./test/stubs/server-only.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
