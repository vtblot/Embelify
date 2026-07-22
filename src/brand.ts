/** Sister products & brand links — override with VITE_*_URL if needed. */
const spektrografyUrl =
  (import.meta.env.VITE_SPEKTROGRAFY_URL as string | undefined)?.trim() ||
  "https://spektrografy.com";

const baggeroUrl =
  (import.meta.env.VITE_BAGGERO_URL as string | undefined)?.trim() ||
  "";

/**
 * Brand assets (footer lockup):
 *   public/baggero-logo.png  ← drop the official Baggero PNG here (replace stand-in)
 *   public/baggero-mark.svg  ← optional SVG fallback if the PNG fails to load
 *
 * Do not regenerate the logo from chat screenshots — use the real source file.
 */
export const BRAND = {
  name: "Embelify",
  /** Operating company */
  company: "Baggero",
  baggero: {
    name: "Baggero",
    url: baggeroUrl,
    /** Official raster lockup — replace public/baggero-logo.png with the real asset */
    logoSrc: "/baggero-logo.png",
    markSrc: "/baggero-mark.svg",
  },
  /** Sister product — same company, separate product & domain */
  spektrografy: {
    name: "Spektrografy",
    url: spektrografyUrl,
    blurbKey: "sister.blurb" as const,
  },
} as const;
