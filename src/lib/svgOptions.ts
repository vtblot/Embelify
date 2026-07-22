/** SVG vectorization controls — mode + continuous sliders. */
export type SvgMode = "logo" | "general";

export type SvgPaletteColor = {
  r: number;
  g: number;
  b: number;
  a: number;
};

export type SvgTraceOptions = {
  ltres: number;
  qtres: number;
  pathomit: number;
  colorsampling: number;
  numberofcolors: number;
  colorquantcycles?: number;
  strokewidth: number;
  blurradius: number;
  blurdelta: number;
  scale: number;
  viewbox: boolean;
  linefilter: boolean;
  rightangleenhance: boolean;
  /** Fixed palette — Logo mode with ≤3 levels. */
  pal?: SvgPaletteColor[];
};

export type SvgSliderControls = {
  mode: SvgMode;
  /** Contour detail 1 (simple) … 10 (fine). */
  detail: number;
  /** Palette levels 2 … 32 (not “named colors” — quantization buckets). */
  palette: number;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Map detail 1–10 → ImageTracer path tolerances.
 * Logo uses a gentler omit curve so thin wordmark stems survive at mid detail.
 * General keeps a wider range for photos.
 */
function detailToTrace(
  detail: number,
  mode: SvgMode,
): Pick<
  SvgTraceOptions,
  "ltres" | "qtres" | "pathomit" | "linefilter" | "rightangleenhance"
> {
  const t = (clamp(detail, 1, 10) - 1) / 9;
  if (mode === "logo") {
    // Wide curve so Advanced "Contour detail" is visibly different at 1 vs 10.
    return {
      ltres: lerp(2.2, 0.2, t),
      qtres: lerp(2.2, 0.2, t),
      pathomit: Math.round(lerp(18, 0, t)),
      linefilter: detail <= 3,
      rightangleenhance: detail <= 8,
    };
  }
  return {
    ltres: lerp(2.4, 0.25, t),
    qtres: lerp(2.4, 0.25, t),
    pathomit: Math.round(lerp(28, 0, t)),
    linefilter: detail <= 6,
    rightangleenhance: detail <= 7,
  };
}

/**
 * Resolve ImageTracer options from mode + sliders.
 *
 * - Logo: flatten dark marks; 2–4 palette levels (N&B / gray logos).
 * - General: full 2–32 levels for photos / multi-color art.
 */
export function resolveSvgTraceOptions(
  controls: SvgSliderControls = { mode: "logo", detail: 7, palette: 4 },
): SvgTraceOptions {
  const mode = controls.mode === "general" ? "general" : "logo";
  const detail = clamp(Math.round(controls.detail), 1, 10);
  let palette = clamp(Math.round(controls.palette), 2, 32);
  const path = detailToTrace(detail, mode);

  if (mode === "logo") {
    // Logo flatten is built for a few tones — keep palette in 2–4
    palette = clamp(palette, 2, 4);
    const base: SvgTraceOptions = {
      ...path,
      colorsampling: 0,
      numberofcolors: palette,
      colorquantcycles: 1,
      strokewidth: 0,
      blurradius: 0,
      blurdelta: 20,
      scale: 1,
      viewbox: true,
    };
    if (palette <= 3) {
      // Flat N&B. Transparent MUST be {0,0,0,a:0} (canvas zeros RGB on a=0).
      base.numberofcolors = 3;
      base.pal = [
        { r: 0, g: 0, b: 0, a: 255 },
        { r: 255, g: 255, b: 255, a: 255 },
        { r: 0, g: 0, b: 0, a: 0 },
      ];
    } else {
      // Black + mid-gray + white + clear — stable cat face banding
      base.numberofcolors = 4;
      base.pal = [
        { r: 0, g: 0, b: 0, a: 255 },
        { r: 96, g: 96, b: 98, a: 255 },
        { r: 255, g: 255, b: 255, a: 255 },
        { r: 0, g: 0, b: 0, a: 0 },
      ];
    }
    return base;
  }

  // General images / shaded art
  return {
    ...path,
    colorsampling: 2,
    numberofcolors: palette,
    colorquantcycles: palette <= 8 ? 2 : 3,
    strokewidth: 0,
    blurradius: 0,
    blurdelta: 20,
    scale: 1,
    viewbox: true,
  };
}

/** @deprecated — kept for older call sites / smokes during transition */
export type SvgStyle = SvgMode | "faithful" | "clean" | "balanced" | "detailed";
/** @deprecated */
export type SvgColors = "few" | "auto" | "many";

/** Bridge old preset names → slider controls. */
export function controlsFromLegacy(
  style?: SvgStyle,
  colors?: SvgColors,
): SvgSliderControls {
  const colorMap: Record<SvgColors, number> = { few: 3, auto: 12, many: 24 };
  if (style === "logo" || !style) {
    return { mode: "logo", detail: 7, palette: colorMap[colors ?? "few"] ?? 4 };
  }
  if (style === "clean") {
    return { mode: "general", detail: 3, palette: colorMap[colors ?? "few"] ?? 6 };
  }
  if (style === "balanced") {
    return { mode: "general", detail: 5, palette: colorMap[colors ?? "auto"] ?? 12 };
  }
  if (style === "detailed" || style === "faithful") {
    return { mode: "general", detail: 8, palette: colorMap[colors ?? "many"] ?? 24 };
  }
  return { mode: "general", detail: 5, palette: 12 };
}
