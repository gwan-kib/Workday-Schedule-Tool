import { defineConfig } from "vite";
import { resolve } from "path";

export default defineConfig({
  build: {
    outDir: "dist",
    emptyOutDir: true,     // wipe dist once, here
    sourcemap: true,
    rollupOptions: {
      input: resolve(__dirname, "src/background.js"),
      output: {
        format: "es",
        entryFileNames: "background.js",
      },
    },
  },
});
