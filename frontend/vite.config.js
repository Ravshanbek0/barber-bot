import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // listen on all interfaces (needed for tunnels)
    allowedHosts: true, // allow ngrok / cloudflare tunnel hostnames
    proxy: {
      "/api": "http://localhost:8000",
      "/media": "http://localhost:8000",
      "/ws": { target: "ws://localhost:8000", ws: true },
    },
  },
});
