import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  build: {
    rollupOptions: {
      input: {
        // The payroll SPA.
        app: path.resolve(import.meta.dirname, "index.html"),
        // The standalone marketing surface — shares no styles with the SPA.
        landing: path.resolve(import.meta.dirname, "landing.html"),
      },
    },
  },
  server: {
    port: 5173,
  },
});
