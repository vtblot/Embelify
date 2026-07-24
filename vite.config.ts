import { resolve } from "node:path";
import type { OutputAsset, Plugin } from "vite";
import { defineConfig } from "vite";

/**
 * Vite injects extracted CSS <link> after <script type="module"> in <head>.
 * That lets the first paint happen unstyled (FOUC), especially while heavy
 * modulepreloads compete for bandwidth. Inline the app CSS early instead.
 */
function inlineAppCss(): Plugin {
  return {
    name: "inline-app-css",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (!ctx.bundle) return html;

        const cssAssets = Object.values(ctx.bundle).filter(
          (item): item is OutputAsset =>
            item.type === "asset" && item.fileName.endsWith(".css"),
        );
        if (cssAssets.length === 0) return html;

        const cssText = cssAssets
          .map((asset) =>
            typeof asset.source === "string"
              ? asset.source
              : new TextDecoder().decode(asset.source),
          )
          .join("\n");

        // Drop bundled stylesheet links (keep Google Fonts / print media).
        let next = html.replace(
          /<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi,
          (tag) => {
            if (/fonts\.googleapis/i.test(tag)) return tag;
            if (/media=["']print["']/i.test(tag)) return tag;
            return "";
          },
        );

        const styleTag = `<style id="embelify-css">${cssText}</style>`;
        const criticalEnd = next.indexOf("</style>");
        if (criticalEnd !== -1) {
          const insertAt = criticalEnd + "</style>".length;
          next = `${next.slice(0, insertAt)}\n  ${styleTag}${next.slice(insertAt)}`;
        } else {
          next = next.replace(/<\/head>/i, `  ${styleTag}\n</head>`);
        }
        return next;
      },
    },
  };
}

export default defineConfig({
  plugins: [inlineAppCss()],
  build: {
    // Avoid racing the first paint against multi‑MB ONNX/TF preloads.
    modulePreload: {
      resolveDependencies: (_filename, deps) =>
        deps.filter((dep) => !/ort\.|onnx|wasm/i.test(dep)),
    },
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
