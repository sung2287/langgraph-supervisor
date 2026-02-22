import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const webAdapterPort = process.env.WEB_ADAPTER_PORT ?? process.env.PORT ?? "3000";

export default defineConfig({
  root: currentDir,
  base: "/v2/",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${webAdapterPort}`,
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: path.resolve(currentDir, "../../../../dist/ui"),
    emptyOutDir: true,
  },
});
