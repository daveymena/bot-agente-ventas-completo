import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

const rawPort = process.env.PORT;
const port = Number(rawPort) || 5173;
// En producción, siempre usar rutas absolutas desde la raíz
const basePath = process.env.NODE_ENV === "production" ? "/" : (process.env.BASE_PATH || "");

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
    proxy: {
      "/tienda": {
        target: process.env.VITE_API_URL || "http://localhost:3002",
        changeOrigin: true,
        secure: false,
      },
      // Las fotos de producto las sirve el backend (/images/products/:id.jpg);
      // en producción es el mismo dominio, en desarrollo hay que pasarlas.
      "/images": {
        target: process.env.VITE_API_URL || "http://localhost:3002",
        changeOrigin: true,
        secure: false,
      },
      // Piezas del Estudio de anuncios (/uploads/anuncios/…) y vídeos.
      "/uploads": {
        target: process.env.VITE_API_URL || "http://localhost:3002",
        changeOrigin: true,
        secure: false,
      },
      "/videos": {
        target: process.env.VITE_API_URL || "http://localhost:3002",
        changeOrigin: true,
        secure: false,
      },
      "/api": {
        target: process.env.VITE_API_URL || "http://localhost:3002",
        changeOrigin: true,
        secure: false,
        ws: true,
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Asegurar que las cookies se envíen
            if (req.headers.cookie) {
              proxyReq.setHeader('cookie', req.headers.cookie);
            }
          });
        },
      },
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
