/** Mirrors src/lib/svgOptions.ts — keep in sync when presets change. */
function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function detailToTrace(detail, mode = "general") {
  const t = (clamp(detail, 1, 10) - 1) / 9;
  if (mode === "logo") {
    return {
      ltres: lerp(1.4, 0.3, t),
      pathomit: Math.round(lerp(10, 1, t)),
      linefilter: detail <= 4,
    };
  }
  return {
    ltres: lerp(2.4, 0.25, t),
    pathomit: Math.round(lerp(28, 0, t)),
    linefilter: detail <= 6,
  };
}
function resolveSvgTraceOptions({ mode = "logo", detail = 7, palette = 3 } = {}) {
  detail = clamp(Math.round(detail), 1, 10);
  palette = clamp(Math.round(palette), 2, 32);
  const path = detailToTrace(detail, mode);
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

const logo = resolveSvgTraceOptions({ mode: "logo", detail: 7, palette: 3 });
const logoFine = resolveSvgTraceOptions({ mode: "logo", detail: 9, palette: 2 });
const logoGray = resolveSvgTraceOptions({ mode: "logo", detail: 4, palette: 4 });
const general = resolveSvgTraceOptions({ mode: "general", detail: 8, palette: 16 });
const simple = resolveSvgTraceOptions({ mode: "general", detail: 1, palette: 8 });

if (!logo.pal) throw new Error("logo ≤3 should use fixed pal");
if (logo.numberofcolors !== 3) throw new Error(`logo colors: ${logo.numberofcolors}`);
if (logoGray.numberofcolors !== 4) throw new Error(`logo gray: ${logoGray.numberofcolors}`);
if (general.numberofcolors !== 16) throw new Error(`general colors: ${general.numberofcolors}`);
if (general.pathomit >= simple.pathomit) throw new Error("high detail should omit fewer paths");
if (simple.ltres <= general.ltres) throw new Error("low detail should be smoother (higher ltres)");
// Logo recommended recipe (detail 7) must keep thin stems
if (logo.pathomit < 2 || logo.pathomit > 5) {
  throw new Error(`logo detail=7 pathomit should be ~3–4, got ${logo.pathomit}`);
}
if (logoFine.pathomit >= logo.pathomit) {
  throw new Error("logo fine detail should omit fewer paths");
}

console.log("SVG_OPTIONS_OK", {
  logo: { colors: logo.numberofcolors, pathomit: logo.pathomit, ltres: logo.ltres },
  logoFine: { pathomit: logoFine.pathomit },
  logoGray: logoGray.numberofcolors,
  general: general.numberofcolors,
  detailOmit: { simple: simple.pathomit, fine: general.pathomit },
});
