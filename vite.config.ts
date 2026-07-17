import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        terms: resolve(__dirname, "terms.html"),
      },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    headers: {
      // Helps onnxruntime / WASM; credentialless keeps CDN fonts & models usable
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 5173,
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "credentialless",
    },
  },
  optimizeDeps: {
    exclude: ["@imgly/background-removal"],
  },
});
