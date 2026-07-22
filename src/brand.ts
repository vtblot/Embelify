/** Sister products & brand links — override with VITE_*_URL if needed. */
const spektrografyUrl =
  (import.meta.env.VITE_SPEKTROGRAFY_URL as string | undefined)?.trim() ||
  "https://spektrografy.com";

const baggeroUrl =
  (import.meta.env.VITE_BAGGERO_URL as string | undefined)?.trim() ||
  "";

/** Official Baggero PNG filenames in public/ — use as-is, never regenerate. */
export const BAGGERO_LOGOS = {
  /** Fond blanc — footer & cutout tests */
  whiteBackground: "BAGGERO + LOGO fond blanc.png",
  /** Lockup standard (fond sombre) */
  default: "BAGGERO + LOGO.png",
} as const;

export function publicAsset(filename: string): string {
  return `/${encodeURI(filename)}`;
}

/**
 * Brand assets (footer lockup):
 *   public/BAGGERO + LOGO fond blanc.png
 *   public/BAGGERO + LOGO.png
 *   public/baggero-mark.svg  ← optional fallback if PNG fails
 */
export const BRAND = {
  name: "Embelify",
  /** Operating company */
  company: "Baggero",
  baggero: {
    name: "Baggero",
    url: baggeroUrl,
    logoSrc: publicAsset(BAGGERO_LOGOS.whiteBackground),
    logoDarkSrc: publicAsset(BAGGERO_LOGOS.default),
    markSrc: "/baggero-mark.svg",
  },
  /** Sister product — same company, separate product & domain */
  spektrografy: {
    name: "Spektrografy",
    url: spektrografyUrl,
    blurbKey: "sister.blurb" as const,
  },
} as const;
