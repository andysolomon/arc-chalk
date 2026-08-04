import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      manifest: {
        name: "Chalk",
        short_name: "Chalk",
        description: "Football play design for individual coaches",
        display: "standalone",
        background_color: "#fafafa",
        theme_color: "#171717",
      },
      workbox: {
        navigateFallback: "/index.html",
      },
    }),
  ],
  server: { host: "127.0.0.1", port: 4173 },
});
