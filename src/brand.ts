/** Sister products & brand links — override with VITE_SPEKTROGRAFY_URL if needed. */
const spektrografyUrl =
  (import.meta.env.VITE_SPEKTROGRAFY_URL as string | undefined)?.trim() ||
  "https://spektrografy.com";

export const BRAND = {
  name: "Embelify",
  company: "Spektrografy",
  /** Primary sister product — same company, separate product & domain */
  spektrografy: {
    name: "Spektrografy",
    url: spektrografyUrl,
    blurbKey: "sister.blurb" as const,
  },
} as const;
