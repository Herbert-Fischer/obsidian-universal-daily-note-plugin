import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      obsidian: path.join(root, "src/test/obsidian-stub.ts"),
    },
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
    exclude: ["src/test/**"],
  },
});
