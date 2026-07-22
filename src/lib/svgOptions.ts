/** User-facing SVG quality presets. */
export type SvgStyle = "logo" | "faithful" | "clean" | "balanced" | "detailed";
/** Palette size for ImageTracer quantization. */
export type SvgColors = "few" | "auto" | "many";

export type SvgTraceOptions = {
  ltres: number;
  qtres: number;
  pathomit: number;
  colorsampling: number;
  numberofcolors: number;
  strokewidth: number;
  blurradius: number;
  blurdelta: number;
  scale: number;
  viewbox: boolean;
  linefilter: boolean;
  rightangleenhance: boolean;
};

const COLOR_COUNT: Record<SvgColors, number> = {
  few: 6,
  auto: 12,
  many: 24,
};

/**
 * Map UI presets → ImageTracer knobs.
 *
 * "logo" = default for dark marks with white features (eyes/nose): flatten
 * preprocess + 2–4 color trace. Avoids Faithful+Many banding / false ear fills.
 * "faithful" + many preserves shading (accepts gray bands).
 * "clean" + few posterizes without the enclosed-island flatten.
 */
export function resolveSvgTraceOptions(
  style: SvgStyle = "logo",
  colors: SvgColors = "few",
): SvgTraceOptions {
  const numberofcolors = COLOR_COUNT[colors] ?? 12;

  if (style === "logo") {
    return {
      ltres: 1,
      qtres: 1,
      pathomit: 8,
      colorsampling: 2,
      // Flatten already forces ~2 colors; keep palette tiny so tracer can't invent bands
      numberofcolors: Math.min(Math.max(numberofcolors, 2), 4),
      strokewidth: 0,
      blurradius: 0,
      blurdelta: 20,
      scale: 1,
      viewbox: true,
      linefilter: true,
      rightangleenhance: true,
    };
  }

  if (style === "faithful") {
    return {
      ltres: 0.35,
      qtres: 0.35,
      pathomit: 2,
      colorsampling: 2,
      numberofcolors: Math.max(numberofcolors, 24),
      strokewidth: 0,
      blurradius: 0,
      blurdelta: 20,
      scale: 1,
      viewbox: true,
      linefilter: false,
      rightangleenhance: false,
    };
  }

  if (style === "detailed") {
    return {
      ltres: 0.5,
      qtres: 0.5,
      pathomit: 4,
      colorsampling: 2,
      numberofcolors: Math.max(numberofcolors, 16),
      strokewidth: 0,
      blurradius: 0,
      blurdelta: 20,
      scale: 1,
      viewbox: true,
      linefilter: false,
      rightangleenhance: false,
    };
  }

  if (style === "balanced") {
    return {
      ltres: 1,
      qtres: 1,
      pathomit: colors === "few" ? 8 : 12,
      colorsampling: 2,
      numberofcolors,
      strokewidth: 0,
      blurradius: 0,
      blurdelta: 20,
      scale: 1,
      viewbox: true,
      linefilter: true,
      rightangleenhance: true,
    };
  }

  // clean — flat logos / marks (posterizes gradients on purpose)
  const pathomit = colors === "few" ? 8 : colors === "auto" ? 14 : 20;
  return {
    ltres: 1.2,
    qtres: 1.2,
    pathomit,
    colorsampling: 2,
    numberofcolors: Math.min(numberofcolors, 10),
    strokewidth: 0,
    blurradius: 0,
    blurdelta: 20,
    scale: 1,
    viewbox: true,
    linefilter: true,
    rightangleenhance: true,
  };
}
