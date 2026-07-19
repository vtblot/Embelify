/**
 * Shared security headers for Vite dev/preview and static hosting docs.
 * Models: @imgly loads ONNX/WASM from https://staticimgly.com (not vendored — ~285MB).
 */

export type HeaderMode = "dev" | "prod";

export function buildSecurityHeaders(mode: HeaderMode): Record<string, string> {
  // blob: required for ONNX Runtime worker/module bootstrap
  const scriptSrc =
    mode === "dev"
      ? "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' blob:"
      : "script-src 'self' 'wasm-unsafe-eval' blob:";

  // Upscaler models are bundled from node_modules (same origin).
  // @imgly rembg still fetches ONNX/WASM from staticimgly.com (~285MB).
  const connectSrc =
    mode === "dev"
      ? "connect-src 'self' https://staticimgly.com blob: ws: wss:"
      : "connect-src 'self' https://staticimgly.com blob:";

  const csp = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    connectSrc,
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");

  return {
    "Content-Security-Policy": csp,
    "Cross-Origin-Opener-Policy": "same-origin",
    // credentialless keeps CDN model fetches usable under COEP
    "Cross-Origin-Embedder-Policy": "credentialless",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-Frame-Options": "DENY",
  };
}
