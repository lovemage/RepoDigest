import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@oceanads/core": path.join(rootDir, "packages/core/src/index.ts"),
      "@oceanads/provider-github": path.join(rootDir, "packages/provider-github/src/index.ts"),
      "@oceanads/provider-git": path.join(rootDir, "packages/provider-git/src/index.ts"),
      "@oceanads/renderer-internal": path.join(rootDir, "packages/renderer-internal/src/index.ts"),
      "@oceanads/renderer-x": path.join(rootDir, "packages/renderer-x/src/index.ts"),
      "@oceanads/renderer-threads": path.join(rootDir, "packages/renderer-threads/src/index.ts"),
      "@oceanads/cli": path.join(rootDir, "packages/cli/src/index.ts")
    }
  },
  test: {
    environment: "node",
    include: ["packages/**/test/**/*.test.ts"]
  }
});
