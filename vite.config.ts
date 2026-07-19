import { resolve } from "node:path";
import { defineConfig } from "vite";
import { buildSecurityHeaders } from "./src/lib/securityHeaders";

export default defineConfig(({ command }) => {
  const mode = command === "serve" ? "dev" : "prod";
  const headers = buildSecurityHeaders(mode);

  return {
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
      headers,
    },
    preview: {
      host: "127.0.0.1",
      port: 5173,
      headers: buildSecurityHeaders("prod"),
    },
    optimizeDeps: {
      exclude: ["@imgly/background-removal"],
    },
  };
});
