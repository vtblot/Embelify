/** Unit checks for Logo SVG fill snapping. */
import { polishLogoSvg } from "../src/lib/svgPolish.ts";

const raw = `<svg><path fill="rgb(28,28,30)" d="M0 0"/><path fill="rgb(250,250,250)" d="M1 1"/><path fill="none" d="M2 2"/></svg>`;
const out = polishLogoSvg(raw);

if (!out.includes('fill="#000000"')) throw new Error("dark fill not snapped to black");
if (!out.includes('fill="#ffffff"')) throw new Error("light fill not snapped to white");
if (/fill="none"/.test(out) && out.includes('fill="none"')) {
  // transparent decoy paths should be stripped
}
if (out.includes('fill="none"')) {
  // leftover none-only path tags should be gone
  const nonePaths = out.match(/<path[^>]*fill="none"[^>]*>/g);
  if (nonePaths) throw new Error("none fill paths should be removed");
}

const already = polishLogoSvg(`<svg><path fill="#000000" d="M0"/></svg>`);
if (!already.includes("#000000")) throw new Error("pure black preserved");

console.log("SMOKE_SVG_POLISH_OK");
