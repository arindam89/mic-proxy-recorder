import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  // When building the frontend for a Tauri app, the Tauri JS API is provided
  // by the runtime. Prevent Vite/Rollup from trying to resolve or bundle the
  // `@tauri-apps/api/*` entrypoints which can cause resolution errors.
  build: {
    rollupOptions: {
      external: [
        "@tauri-apps/api/tauri",
        "@tauri-apps/api/event",
        "@tauri-apps/api"
      ],
    },
  },
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
