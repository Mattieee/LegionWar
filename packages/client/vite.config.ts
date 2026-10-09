import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const page = (file: string): string => fileURLToPath(new URL(file, import.meta.url));

export default defineConfig({
  server: {
    port: 5173,
    open: false,
  },
  worker: {
    format: "es",
  },
  build: {
    target: "es2022",
    sourcemap: true,
    rollupOptions: {
      input: {
        game: page("./index.html"),
        designSystem: page("./design-system.html"),
      },
    },
  },
});
