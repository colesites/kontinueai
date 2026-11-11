import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  // Tauri serves bundled files from a custom app:// origin. Root-absolute URLs
  // such as /assets/index.js resolve outside the packaged asset directory on
  // macOS, leaving the window black before the frontend can start.
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    {
      // The editor runs its own TypeScript worker (MonacoEnvironment.getWorker),
      // so drop Monaco's fallback reference to its stock one; otherwise Vite
      // bundles a second ~7 MB copy that is never loaded.
      name: "kontinue:monaco-ts-worker",
      enforce: "pre" as const,
      transform(code: string, id: string) {
        if (!id.replace(/\\/g, "/").endsWith("monaco-editor/esm/vs/languages/features/typescript/workerManager.js")) return null;
        const next = code.replace(/createWorker: \(\) => new Worker\(new URL\('ts\.worker\.js', import\.meta\.url\), \{ type: "module" \}\),/, "");
        if (next === code) this.warn("Monaco's TypeScript worker reference changed; check vite.config.ts");
        return next;
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  worker: {
    // Monaco's language workers are ES modules.
    format: "es" as const,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
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
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
