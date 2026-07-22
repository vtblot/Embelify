/** Mirrors src/lib/svgOptions.ts — keep in sync when presets change. */
function resolveSvgTraceOptions(style = "logo", colors = "few") {
  const COLOR_COUNT = { few: 6, auto: 12, many: 24 };
  const numberofcolors = COLOR_COUNT[colors] ?? 12;

  if (style === "logo") {
    return {
      pathomit: 8,
      numberofcolors: 3,
      linefilter: true,
      colorsampling: 0,
      blurradius: 0,
      pal: true,
    };
  }
  if (style === "faithful") {
    return {
      pathomit: 2,
      numberofcolors: Math.max(numberofcolors, 24),
      linefilter: false,
      colorsampling: 2,
      blurradius: 0,
    };
  }
  if (style === "detailed") {
    return {
      pathomit: 4,
      numberofcolors: Math.max(numberofcolors, 16),
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

const logo = resolveSvgTraceOptions("logo", "few");
const faithful = resolveSvgTraceOptions("faithful", "many");
const cleanFew = resolveSvgTraceOptions("clean", "few");

if (logo.numberofcolors !== 3) throw new Error(`logo colors: ${logo.numberofcolors}`);
if (!logo.pal) throw new Error("logo must use fixed palette");
if (logo.colorsampling !== 0) throw new Error("logo should disable sampling");
if (faithful.numberofcolors < 24) throw new Error(`faithful colors: ${faithful.numberofcolors}`);
if (cleanFew.pathomit > 12) throw new Error(`few pathomit too high: ${cleanFew.pathomit}`);

console.log("SVG_OPTIONS_OK", {
  logo: logo.numberofcolors,
  faithful: faithful.numberofcolors,
  fewOmit: cleanFew.pathomit,
});
