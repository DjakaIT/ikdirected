// @ts-check
import { defineConfig, fontProviders, passthroughImageService, sessionDrivers } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import preact from "@astrojs/preact";

export default defineConfig({
  output: "server",
  devToolbar: { enabled: false },
  adapter: cloudflare({
    // No image transforms at the edge: photos are pre-sized in the admin's browser (SECURITY §8).
    imageService: "passthrough",
  }),
  // The app keeps no server sessions; an explicit (unused) in-memory driver stops the adapter provisioning a KV namespace.
  session: { driver: sessionDrivers.lruCache() },
  image: { service: passthroughImageService() },
  // The admin image worker lazy-loads the WebP WASM fallback, which needs ES-module workers.
  vite: {
    worker: { format: "es" },
    // Declared up front so the dev optimizer never re-bundles mid-run (stale deps in workerd).
    optimizeDeps: {
      include: ["preact", "preact/hooks", "preact/jsx-dev-runtime", "@preact/signals", "sortablejs"],
      exclude: ["@jsquash/webp"],
    },
    ssr: { optimizeDeps: { include: ["preact", "preact/hooks", "preact/jsx-dev-runtime", "preact/jsx-runtime", "@preact/signals"] } },
  },
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
      // Plain system-ui fallback as in the reference: glyphs Archivo lacks (→ ✕) render like the design.
      optimizedFallbacks: false,
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
