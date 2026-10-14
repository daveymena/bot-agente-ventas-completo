import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

const apiTarget = process.env.STOCK_API_URL || `http://localhost:${process.env.STOCK_PORT || 3010}`;
const port = Number(process.env.STOCK_WEB_PORT || 5180);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "web"), "@shared": path.resolve(import.meta.dirname, "shared") },
    dedupe: ["react", "react-dom"],
  },
  build: { outDir: path.resolve(import.meta.dirname, "dist/public"), emptyOutDir: true, sourcemap: false },
  server: {
    port, strictPort: true, host: "0.0.0.0", allowedHosts: true,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: false },
      "/media": { target: apiTarget, changeOrigin: false },
    },
  },
  preview: { port, host: "0.0.0.0", allowedHosts: true },
});
