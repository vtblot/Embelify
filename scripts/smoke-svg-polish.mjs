import { polishLogoSvg } from "../src/lib/svgPolish.ts";

const raw = `<svg><path fill="rgb(28,28,30)" d="M0 0"/><path fill="rgb(96,96,98)" d="M0 1"/><path fill="rgb(250,250,250)" d="M1 1"/><path fill="none" d="M2 2"/></svg>`;
const out = polishLogoSvg(raw);

if (!out.includes('fill="#000000"')) throw new Error("dark fill not snapped to black");
if (!out.includes('fill="#ffffff"')) throw new Error("light fill not snapped to white");
if (!out.includes("96,96,98") && !out.includes("#606062")) {
  // mid gray must survive (either original rgb or hex)
  if (!/fill=["']rgb\(96,\s*96,\s*98\)["']/.test(out)) {
    throw new Error("mid-gray fill must not be snapped away");
  }
}
if (out.includes('fill="none"')) {
  const nonePaths = out.match(/<path[^>]*fill="none"[^>]*>/g);
  if (nonePaths) throw new Error("none fill paths should be removed");
}

console.log("SMOKE_SVG_POLISH_OK");
