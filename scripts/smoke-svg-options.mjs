/** Mirrors src/lib/svgOptions.ts — keep in sync when presets change. */
function resolveSvgTraceOptions(style = "faithful", colors = "many") {
  const COLOR_COUNT = { few: 6, auto: 10, many: 16 };
  const numberofcolors = COLOR_COUNT[colors] ?? 10;

  if (style === "faithful") {
    return {
      pathomit: 2,
      numberofcolors: Math.max(numberofcolors, 16),
      linefilter: false,
      colorsampling: 2,
      blurradius: 0,
    };
  }
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

const faithful = resolveSvgTraceOptions("faithful", "many");
const cleanFew = resolveSvgTraceOptions("clean", "few");
const detailed = resolveSvgTraceOptions("detailed", "many");

if (faithful.numberofcolors < 16) throw new Error(`faithful colors: ${faithful.numberofcolors}`);
if (faithful.pathomit > 4) throw new Error(`faithful pathomit too high: ${faithful.pathomit}`);
if (faithful.linefilter) throw new Error("faithful should not linefilter");
if (cleanFew.numberofcolors !== 6) throw new Error(`few colors: ${cleanFew.numberofcolors}`);
if (cleanFew.pathomit > 12) throw new Error(`few pathomit too high: ${cleanFew.pathomit}`);
if (detailed.pathomit > cleanFew.pathomit) throw new Error("detailed should omit fewer than clean");

console.log("SVG_OPTIONS_OK", {
  faithful: faithful.numberofcolors,
  few: cleanFew.numberofcolors,
  fewOmit: cleanFew.pathomit,
  detailed: detailed.numberofcolors,
});
