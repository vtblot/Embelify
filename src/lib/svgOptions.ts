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
  // 4 was too low with transparency (palette slots eaten by empty bg) — wiped logos.
  few: 6,
  auto: 10,
  many: 16,
};

/**
 * Map UI presets → ImageTracer knobs.
 * Clean favors logos: enough palette slots (few was 4 + pathomit 36 → empty SVG),
 * modest pathomit, no pre-blur.
 */
export function resolveSvgTraceOptions(
  style: SvgStyle = "clean",
  colors: SvgColors = "auto",
): SvgTraceOptions {
  const numberofcolors = COLOR_COUNT[colors] ?? 10;

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

  // clean — logos: keep pathomit low when colors are few (high omit erased shapes)
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
