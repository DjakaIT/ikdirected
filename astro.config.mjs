// @ts-check
import { defineConfig, fontProviders, passthroughImageService, sessionDrivers } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import preact from "@astrojs/preact";

export default defineConfig({
  output: "server",
  adapter: cloudflare({
    // No image transforms at the edge: photos are pre-sized in the admin's browser (SECURITY §8).
    imageService: "passthrough",
  }),
  // The app keeps no server sessions; an explicit (unused) in-memory driver stops the adapter provisioning a KV namespace.
  session: { driver: sessionDrivers.lruCache() },
  image: { service: passthroughImageService() },
  // Preact islands live only in the admin; public pages ship no framework JS.
  integrations: [preact({ include: ["src/admin/**"] })],
  // Self-hosted at build time (font-src 'self'); latin-ext carries č ć đ š ž.
  fonts: [
    {
      provider: fontProviders.google(),
      name: "Archivo",
      cssVariable: "--font-archivo",
      weights: ["300 800"],
      styles: ["normal"],
      subsets: ["latin", "latin-ext"],
      fallbacks: ["system-ui", "sans-serif"],
      options: { experimental: { variableAxis: { wdth: [["75", "125"]] } } },
    },
    {
      provider: fontProviders.google(),
      name: "Space Mono",
      cssVariable: "--font-space-mono",
      weights: [400],
      styles: ["normal"],
      subsets: ["latin", "latin-ext"],
      fallbacks: ["ui-monospace", "monospace"],
    },
  ],
});
