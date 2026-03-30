import { defineConfig } from "vite";
import { resolve } from "path";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        { src: "src/popup.html", dest: "" },
        { src: "src/popup.css", dest: "" },
      ],
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: true,
    rollupOptions: {
      input: resolve(__dirname, "src/popup.js"),
      output: {
        format: "es",
        entryFileNames: "popup.js",
      },
    },
  },
});
