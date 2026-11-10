import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        // The real PHP admin API (api/) on PHP's built-in server; needs dist/ (npm run build) for the router.
        test: {
          name: "php",
          include: ["tests/php/**/*.test.ts"],
          environment: "node",
          testTimeout: 30_000,
          hookTimeout: 30_000,
        },
      },
    ],
  },
});
