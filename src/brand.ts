/** Sister products & brand links — override with VITE_*_URL if needed. */
const spektrografyUrl =
  (import.meta.env.VITE_SPEKTROGRAFY_URL as string | undefined)?.trim() ||
  "https://spektrografy.com";

const baggeroUrl =
  (import.meta.env.VITE_BAGGERO_URL as string | undefined)?.trim() ||
  "";

export const BRAND = {
  name: "Embelify",
  /** Operating company */
  company: "Baggero",
  baggero: {
    name: "Baggero",
    url: baggeroUrl,
    markSrc: "/baggero-mark.svg",
  },
  /** Sister product — same company, separate product & domain */
  spektrografy: {
    name: "Spektrografy",
    url: spektrografyUrl,
    blurbKey: "sister.blurb" as const,
  },
} as const;
