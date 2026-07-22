/** User-facing SVG quality presets. */
export type SvgStyle = "clean" | "balanced" | "detailed";
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
  few: 4,
  auto: 8,
  many: 16,
};

/**
 * Map UI presets → ImageTracer knobs.
 * Default "clean" favors logos: fewer colors, omit tiny paths, light pre-blur.
 */
export function resolveSvgTraceOptions(
  style: SvgStyle = "clean",
  colors: SvgColors = "auto",
): SvgTraceOptions {
  const numberofcolors = COLOR_COUNT[colors] ?? 8;

  if (style === "detailed") {
    return {
      ltres: 0.5,
      qtres: 0.5,
      pathomit: 4,
      colorsampling: 2,
      numberofcolors: Math.max(numberofcolors, 12),
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
      pathomit: 12,
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

  // clean — logos: no pre-blur (blur invents a gray halo path), omit crumbs
  return {
    ltres: 1.5,
    qtres: 1.5,
    pathomit: 36,
    colorsampling: 2,
    numberofcolors: Math.min(numberofcolors, 8),
    strokewidth: 0,
    blurradius: 0,
    blurdelta: 20,
    scale: 1,
    viewbox: true,
    linefilter: true,
    rightangleenhance: true,
  };
}
