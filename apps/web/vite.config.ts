import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type ViteDevServer } from "vite";
import { VitePWA } from "vite-plugin-pwa";

function rewriteSharePaths(req: { url?: string }, next: () => void): void {
  const pathname = req.url?.split("?")[0] ?? "";
  if (/^\/s\/[^/]+$/.test(pathname)) {
    req.url = "/share.html";
  }
  next();
}

function sharePathRewrite() {
  const useOn = (server: { middlewares: ViteDevServer["middlewares"] }) => {
    server.middlewares.use((req, _res, next) => {
      rewriteSharePaths(req, next);
    });
  };
  return {
    name: "chalk-share-path-rewrite",
    configureServer: useOn,
    configurePreviewServer: useOn,
  };
}

function relaxShareCspInDev() {
  return {
    name: "chalk-share-csp-dev",
    transformIndexHtml(html: string, ctx: { server?: unknown }) {
      if (!ctx.server) return html;
      return html.replace(
        /\s*<meta\s+http-equiv="Content-Security-Policy"[^>]*>/i,
        "",
      );
    },
  };
}

export default defineConfig({
  plugins: [
    sharePathRewrite(),
    relaxShareCspInDev(),
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
        navigateFallbackDenylist: [/^\/s\//],
      },
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        main: "index.html",
        share: "share.html",
      },
    },
  },
  server: { host: "127.0.0.1", port: 4173 },
});
