import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __CHALK_VERSION__: JSON.stringify(""),
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./apps/web/src/test-setup.ts"],
    include: [
      "apps/**/*.test.{ts,tsx}",
      "packages/**/*.test.ts",
      "tests/**/*.test.ts",
    ],
  },
});
