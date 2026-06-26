import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Runs on 5174 so it can sit beside the main app (5173). For local dev the API
// is proxied to the Django backend (same-origin → no CORS). In production set
// VITE_API_BASE to the Render URL instead (see .env.example).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
