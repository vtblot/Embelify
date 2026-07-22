/** Mirrors src/lib/svgOptions.ts — keep in sync when presets change. */
function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function detailToTrace(detail) {
  const t = (clamp(detail, 1, 10) - 1) / 9;
  return {
    ltres: lerp(2.4, 0.25, t),
    pathomit: Math.round(lerp(28, 0, t)),
    linefilter: detail <= 6,
  };
}
function resolveSvgTraceOptions({ mode = "logo", detail = 5, palette = 3 } = {}) {
  detail = clamp(Math.round(detail), 1, 10);
  palette = clamp(Math.round(palette), 2, 32);
  const path = detailToTrace(detail);
  if (mode === "logo") {
    palette = clamp(palette, 2, 4);
    return {
      ...path,
      numberofcolors: palette <= 3 ? 3 : palette,
      colorsampling: palette <= 3 ? 0 : 2,
      pal: palette <= 3,
      colorquantcycles: 1,
    };
  }
  return {
    ...path,
    numberofcolors: palette,
    colorsampling: 2,
    pal: false,
  };
}

const logo = resolveSvgTraceOptions({ mode: "logo", detail: 5, palette: 3 });
const logoGray = resolveSvgTraceOptions({ mode: "logo", detail: 4, palette: 4 });
const general = resolveSvgTraceOptions({ mode: "general", detail: 8, palette: 16 });
const simple = resolveSvgTraceOptions({ mode: "general", detail: 1, palette: 8 });

if (!logo.pal) throw new Error("logo ≤3 should use fixed pal");
if (logo.numberofcolors !== 3) throw new Error(`logo colors: ${logo.numberofcolors}`);
if (logoGray.numberofcolors !== 4) throw new Error(`logo gray: ${logoGray.numberofcolors}`);
if (general.numberofcolors !== 16) throw new Error(`general colors: ${general.numberofcolors}`);
if (general.pathomit >= simple.pathomit) throw new Error("high detail should omit fewer paths");
if (simple.ltres <= general.ltres) throw new Error("low detail should be smoother (higher ltres)");

console.log("SVG_OPTIONS_OK", {
  logo: logo.numberofcolors,
  logoGray: logoGray.numberofcolors,
  general: general.numberofcolors,
  detailOmit: { simple: simple.pathomit, fine: general.pathomit },
});
