import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const basePath = process.env.NODE_ENV === "production" ? "/tienda/" : "/";

export default defineConfig({
  base: basePath,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    proxy: {
      '/api': {
        // API_REMOTO permite apuntar el proxy a un servidor ya desplegado para
        // ver la tienda con el catálogo real sin levantar el backend local.
        // Sin la variable, el comportamiento es el de siempre.
        target: process.env.API_REMOTO || 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
      '/images': {
        target: process.env.API_REMOTO || 'http://localhost:3002',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
