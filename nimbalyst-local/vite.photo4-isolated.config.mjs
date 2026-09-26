import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "C:/Users/manuj/code_barely_runs/Objectquest",
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": "C:/Users/manuj/code_barely_runs/Objectquest/shared",
    },
  },
  server: {
    host: "127.0.0.1",
    port: 15173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:18799",
        changeOrigin: true,
      },
    },
  },
});
