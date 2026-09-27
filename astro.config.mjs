// @ts-check
import { defineConfig, passthroughImageService, sessionDrivers } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import preact from "@astrojs/preact";

export default defineConfig({
  output: "server",
  adapter: cloudflare({
    // No image transforms at the edge: photos are pre-sized in the admin's browser (SECURITY §8).
    imageService: "passthrough",
  }),
  // The app keeps no server sessions; the null driver stops the adapter provisioning a KV namespace.
  session: { driver: sessionDrivers.null() },
  image: { service: passthroughImageService() },
  // Preact islands live only in the admin; public pages ship no framework JS.
  integrations: [preact({ include: ["src/admin/**"] })],
});
