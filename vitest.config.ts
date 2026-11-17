import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/helpers/entorno.ts"],
    testTimeout: 30000,
    hookTimeout: 60000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
