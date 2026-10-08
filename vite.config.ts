import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `npm run dev` runs Vite (hot reload) in front of `wrangler dev` (API + Durable Object).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://127.0.0.1:8787", ws: true } },
  },
  build: { target: "es2022", chunkSizeWarningLimit: 800 },
});
