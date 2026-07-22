/** Mirrors src/lib/svgOptions.ts — keep in sync when presets change. */
function resolveSvgTraceOptions(style = "clean", colors = "auto") {
  const COLOR_COUNT = { few: 4, auto: 8, many: 16 };
  const numberofcolors = COLOR_COUNT[colors] ?? 8;

  if (style === "detailed") {
    return {
      pathomit: 4,
      numberofcolors: Math.max(numberofcolors, 12),
      linefilter: false,
    };
  }
  if (style === "balanced") {
    return { pathomit: 12, numberofcolors, linefilter: true };
  }
  return {
    pathomit: 36,
    numberofcolors: Math.min(numberofcolors, 8),
    linefilter: true,
    blurradius: 0,
  };
}

const clean = resolveSvgTraceOptions("clean", "auto");
const detailed = resolveSvgTraceOptions("detailed", "many");
const few = resolveSvgTraceOptions("clean", "few");

if (clean.numberofcolors !== 8) throw new Error(`clean colors: ${clean.numberofcolors}`);
if (clean.pathomit < 20) throw new Error(`clean pathomit too low: ${clean.pathomit}`);
if (clean.blurradius !== 0) throw new Error("clean must not pre-blur (creates halo)");
if (!clean.linefilter) throw new Error("clean should linefilter");
if (few.numberofcolors !== 4) throw new Error(`few colors: ${few.numberofcolors}`);
if (detailed.numberofcolors < 12) throw new Error(`detailed colors: ${detailed.numberofcolors}`);
if (detailed.pathomit > clean.pathomit) throw new Error("detailed should omit fewer paths");

console.log("SVG_OPTIONS_OK", {
  clean: clean.numberofcolors,
  pathomit: clean.pathomit,
  detailed: detailed.numberofcolors,
});
