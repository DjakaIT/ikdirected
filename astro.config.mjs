// @ts-check
import { defineConfig, fontProviders, passthroughImageService } from "astro/config";
import preact from "@astrojs/preact";

export default defineConfig({
  // Static HTML for shared hosting (Hostinger): no Node process at runtime. Content comes from the
  // export the admin backend (api/, PHP) publishes; see docs/ARCHITECTURE.md §1.
  output: "static",
  site: (process.env.SITE_ORIGIN || "https://ikdirected.com").replace(/\/+$/, ""),
  // Clean URLs without trailing slash: /radovi/slug -> radovi/slug.html (public/.htaccess maps them).
  trailingSlash: "never",
  build: { format: "file" },
  devToolbar: { enabled: false },
  // CSP (SECURITY §4) as a <meta> per page with the hashes of its scripts and styles; directives a <meta> cannot
  // carry (frame-ancestors) are headers in public/.htaccess. img-src and admin extras come from the layouts.
  security: {
    csp: {
      algorithm: "SHA-256",
      directives: ["default-src 'self'", "font-src 'self'", "connect-src 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'"],
    },
  },
  // No image transforms: photos are pre-sized in the admin's browser (SECURITY §8).
  image: { service: passthroughImageService() },
  // The admin image worker lazy-loads the WebP WASM fallback, which needs ES-module workers.
  vite: {
    worker: { format: "es" },
    plugins: [
      {
        // Dev only: /admin/albumi/{id} is one static page (public/.htaccess does this rewrite on the hosting).
        name: "ik-admin-album-route",
        configureServer(server) {
          server.middlewares.use((req, _res, next) => {
            if (req.url && /^\/admin\/albumi\/[0-9a-f-]{36}\/?(\?.*)?$/.test(req.url)) req.url = "/admin/album";
            next();
          });
        },
      },
    ],
    // Declared up front so the dev optimizer never re-bundles mid-run.
    optimizeDeps: {
      include: ["preact", "preact/hooks", "preact/jsx-dev-runtime", "@preact/signals", "sortablejs"],
      exclude: ["@jsquash/webp"],
    },
    // Dev only: the PHP admin API and uploaded media come from the local PHP server (scripts/dev.mjs).
    server: {
      proxy: {
        "/api": "http://127.0.0.1:8787",
        "/media": "http://127.0.0.1:8787",
      },
    },
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
