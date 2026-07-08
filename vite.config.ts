import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: null,
      filename: "sw.js",
      strategies: "generateSW",
      devOptions: { enabled: false },
      manifest: false, // ya servido en public/manifest.webmanifest
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico,webp,woff,woff2}"],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        navigationPreload: true,
        // No cachear callbacks OAuth ni endpoints server / api
        navigateFallbackDenylist: [
          /^\/~oauth/,
          /^\/api\//,
          /^\/_server/,
        ],
        runtimeCaching: [
          // HTML: siempre red primero, fallback a caché para offline
          {
            urlPattern: ({ request }) => request.mode === "navigate",
            handler: "NetworkFirst",
            options: {
              cacheName: "html-nav",
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          // Assets hasheados de la propia app: cache-first
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /\.(?:js|css|woff2?|ttf|otf)$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "assets",
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          // Imágenes propias
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && /\.(?:png|jpg|jpeg|webp|svg|ico)$/.test(url.pathname),
            handler: "CacheFirst",
            options: {
              cacheName: "images",
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
});
