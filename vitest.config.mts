import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname) },
  },
  test: {
    include: ["engine/**/*.test.ts", "data/**/*.test.ts", "lib/**/*.test.ts"],
    environment: "node",
  },
});
