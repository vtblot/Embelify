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
      ltres: lerp(2.2, 0.2, t),
      pathomit: Math.round(lerp(18, 0, t)),
      linefilter: detail <= 3,
    };
  }
  return {
    ltres: lerp(2.4, 0.25, t),
    pathomit: Math.round(lerp(28, 0, t)),
    linefilter: detail <= 6,
  };
}
function resolveSvgTraceOptions({ mode = "logo", detail = 7, palette = 4 } = {}) {
  detail = clamp(Math.round(detail), 1, 10);
  palette = clamp(Math.round(palette), 2, 32);
  const path = detailToTrace(detail, mode);
  if (mode === "logo") {
    palette = clamp(palette, 2, 4);
    if (palette <= 3) {
      return {
        ...path,
        numberofcolors: 3,
        colorsampling: 0,
        pal: true,
        grayPal: false,
      };
    }
    return {
      ...path,
      numberofcolors: 4,
      colorsampling: 0,
      pal: true,
      grayPal: true,
    };
  }
  return {
    ...path,
    numberofcolors: palette,
    colorsampling: 2,
    pal: false,
  };
}

const logo = resolveSvgTraceOptions({ mode: "logo", detail: 7, palette: 4 });
const logoFlat = resolveSvgTraceOptions({ mode: "logo", detail: 7, palette: 3 });
const logoFine = resolveSvgTraceOptions({ mode: "logo", detail: 9, palette: 4 });
const logoCoarse = resolveSvgTraceOptions({ mode: "logo", detail: 2, palette: 4 });
const general = resolveSvgTraceOptions({ mode: "general", detail: 8, palette: 16 });
const simple = resolveSvgTraceOptions({ mode: "general", detail: 1, palette: 8 });

if (!logo.pal || !logo.grayPal) throw new Error("logo palette 4 should use gray pal");
if (logo.numberofcolors !== 4) throw new Error(`logo colors: ${logo.numberofcolors}`);
if (!logoFlat.pal || logoFlat.grayPal) throw new Error("logo palette 3 should be flat");
if (logoFlat.numberofcolors !== 3) throw new Error(`logo flat colors: ${logoFlat.numberofcolors}`);
if (general.numberofcolors !== 16) throw new Error(`general colors: ${general.numberofcolors}`);
if (general.pathomit >= simple.pathomit) throw new Error("high detail should omit fewer paths");
if (simple.ltres <= general.ltres) throw new Error("low detail should be smoother (higher ltres)");
if (logo.pathomit < 4 || logo.pathomit > 8) {
  throw new Error(`logo detail=7 pathomit should be ~6, got ${logo.pathomit}`);
}
if (logoFine.pathomit >= logo.pathomit) {
  throw new Error("logo fine detail should omit fewer paths");
}
if (logoCoarse.pathomit - logoFine.pathomit < 8) {
  throw new Error(
    `logo detail slider should change pathomit a lot (coarse ${logoCoarse.pathomit} vs fine ${logoFine.pathomit})`,
  );
}

console.log("SVG_OPTIONS_OK", {
  logo: { colors: logo.numberofcolors, pathomit: logo.pathomit, ltres: logo.ltres },
  logoFine: { pathomit: logoFine.pathomit },
  logoFlat: logoFlat.numberofcolors,
  general: general.numberofcolors,
  detailOmit: { simple: simple.pathomit, fine: general.pathomit },
});
