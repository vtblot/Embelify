/** Mirrors src/lib/svgOptions.ts — keep in sync when presets change. */
function resolveSvgTraceOptions(style = "clean", colors = "auto") {
  const COLOR_COUNT = { few: 6, auto: 10, many: 16 };
  const numberofcolors = COLOR_COUNT[colors] ?? 10;

  if (style === "detailed") {
    return {
      pathomit: 4,
      numberofcolors: Math.max(numberofcolors, 12),
      linefilter: false,
      colorsampling: 2,
      blurradius: 0,
    };
  }
  if (style === "balanced") {
    return {
      pathomit: colors === "few" ? 8 : 12,
      numberofcolors,
      linefilter: true,
      colorsampling: 2,
      blurradius: 0,
    };
  }
  const pathomit = colors === "few" ? 8 : colors === "auto" ? 14 : 20;
  return {
    pathomit,
    numberofcolors: Math.min(numberofcolors, 10),
    linefilter: true,
    blurradius: 0,
    colorsampling: 2,
  };
}

const cleanFew = resolveSvgTraceOptions("clean", "few");
const clean = resolveSvgTraceOptions("clean", "auto");
const detailed = resolveSvgTraceOptions("detailed", "many");

if (cleanFew.numberofcolors !== 6) throw new Error(`few colors: ${cleanFew.numberofcolors}`);
if (cleanFew.pathomit > 12) throw new Error(`few pathomit too high: ${cleanFew.pathomit}`);
if (clean.blurradius !== 0) throw new Error("clean must not pre-blur (creates halo)");
if (!clean.linefilter) throw new Error("clean should linefilter");
if (detailed.numberofcolors < 12) throw new Error(`detailed colors: ${detailed.numberofcolors}`);
if (detailed.pathomit > cleanFew.pathomit) throw new Error("detailed should omit fewer paths");

console.log("SVG_OPTIONS_OK", {
  few: cleanFew.numberofcolors,
  fewOmit: cleanFew.pathomit,
  auto: clean.numberofcolors,
  detailed: detailed.numberofcolors,
});
