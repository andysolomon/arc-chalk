import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // The worker is Chalk's own source (src/sw.ts); the plugin only injects
      // the versioned shell manifest into it.
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      // The page registers the worker itself so it can surface update,
      // offline, and failure states; nothing is injected into index.html.
      injectRegister: false,
      // A new shell waits for the Coach; it never takes over a page on its own.
      registerType: "prompt",
      includeAssets: ["favicon.svg", "icons/*.png"],
      manifest: {
        name: "Chalk",
        short_name: "Chalk",
        description: "Football play design for individual coaches",
        display: "standalone",
        orientation: "any",
        background_color: "#fafafa",
        theme_color: "#171717",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        // Only the shell and its safe static assets are ever precached.
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest,woff2}"],
        globIgnores: ["**/sw.js", "**/workbox-*.js"],
      },
    }),
  ],
  server: { host: "127.0.0.1", port: 4173 },
});
