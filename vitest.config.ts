import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "server-only": new URL("./tests/support/server-only.ts", import.meta.url).pathname,
    },
  },
});
