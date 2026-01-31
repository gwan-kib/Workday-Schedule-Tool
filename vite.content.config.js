import { defineConfig } from "vite";
import { resolve } from "path";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    viteStaticCopy({
      targets: [
        { src: "src/panel.html", dest: "" },
        { src: "src/css", dest: "" }, // becomes dist/css/**
        { src: "icon16.png", dest: "" },
        { src: "icon32.png", dest: "" },
        { src: "icon48.png", dest: "" },
        { src: "icon128.png", dest: "" },
      ],
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: false,
    sourcemap: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(__dirname, "src/content.js"),
      output: {
        format: "iife",
        entryFileNames: "content.js",
        inlineDynamicImports: true,
      },
    },
  },
});
