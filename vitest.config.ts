import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

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
        plugins: [
          cloudflareTest({
            main: "./tests/integration/worker.ts",
            wrangler: { configPath: "./wrangler.jsonc" },
            miniflare: {
              bindings: {
                SITE_ORIGIN: "http://localhost:4321",
                PUBLIC_MEDIA_BASE: "/_dev/media",
                CF_ACCESS_TEAM_DOMAIN: "https://test.cloudflareaccess.com",
                CF_ACCESS_AUD: "test-aud",
                ADMIN_EMAILS: "admin@example.test",
              },
            },
          }),
        ],
        test: {
          name: "workers",
          include: ["tests/integration/**/*.test.ts"],
        },
      },
    ],
  },
});
