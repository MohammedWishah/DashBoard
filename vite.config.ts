import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@shared": path.resolve(__dirname, "shared"),
      // Guest mode runs the API in the browser; see src/lib/guest.ts.
      "@guest-api": path.resolve(__dirname, "functions/lib/guest.ts"),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // Pages Functions run under `wrangler pages dev` on :8788.
      "/api": {
        target: "http://127.0.0.1:8788",
        changeOrigin: true,
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 1500,
  },
});
