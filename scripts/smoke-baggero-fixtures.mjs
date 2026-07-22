/**
 * Run Embelify cutout + Logo+gray SVG on fixtures/baggero/{white,black}-bg.png
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const ROOT = path.resolve("fixtures/baggero");
const FIXTURES = [
  { id: "white-bg", file: path.join(ROOT, "white-bg.png"), expectGray: true, expectWhite: true },
  { id: "black-bg", file: path.join(ROOT, "black-bg.png"), expectGray: false, expectWhite: false, expectHard: true },
];

for (const fx of FIXTURES) {
  if (!fs.existsSync(fx.file)) throw new Error(`Missing fixture: ${fx.file}`);
}

const browser = await chromium.launch({ headless: true });
const summary = [];

for (const fx of FIXTURES) {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    const rembg = document.getElementById("remove_bg");
    const svg = document.getElementById("to_svg");
    rembg.checked = true;
    rembg.dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("bg_mode").value = "chroma";
    document.getElementById("bg_mode").dispatchEvent(new Event("change", { bubbles: true }));
    document.getElementById("cut_scope").value = "auto";
    document.getElementById("cut_scope").dispatchEvent(new Event("change", { bubbles: true }));
    svg.checked = true;
    svg.dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector('[data-svg-recipe="logo"]')?.click();
  });
  await page.setInputFiles("#file-input", fx.file);
  await page.waitForFunction(() => {
    const svg = document.querySelector("#preview-svg svg");
    const err = document.querySelector(".status.is-error");
    return Boolean(svg) || Boolean(err);
  }, { timeout: 180000 });
  await page.waitForTimeout(400);

  const info = await page.evaluate(() => {
    const fills = [
      ...new Set(
        [...document.querySelectorAll("#preview-svg [fill]")].map((e) =>
          (e.getAttribute("fill") || "").toLowerCase(),
        ),
      ),
    ].filter((f) => f && f !== "none");
    const paths = [...document.querySelectorAll("#preview-svg path")];
    const fullRect = paths.some((p) => {
      const fill = (p.getAttribute("fill") || "").toLowerCase();
      const d = p.getAttribute("d") || "";
      return (fill === "#000000" || fill.includes("0,0,0")) && /^M\s*0\s+0\s+L\s+\d+\s+0/i.test(d);
    });
    return {
      status: document.getElementById("status")?.textContent || "",
      fills,
      pathN: paths.length,
      fullRect,
      hasSvg: paths.length > 0,
    };
  });

  const luma = (fill) => {
    const rgb = fill.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
    if (rgb) return 0.2126 * +rgb[1] + 0.7152 * +rgb[2] + 0.0722 * +rgb[3];
    const hex = fill.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!hex) return -1;
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    return (
      0.2126 * parseInt(h.slice(0, 2), 16) +
      0.7152 * parseInt(h.slice(2, 4), 16) +
      0.0722 * parseInt(h.slice(4, 6), 16)
    );
  };
  const lumas = info.fills.map(luma).filter((L) => L >= 0);
  const hasGray = lumas.some((L) => L > 45 && L < 170);
  const hasWhite = lumas.some((L) => L > 220);
  const hasDark = lumas.some((L) => L >= 0 && L <= 45);

  let verdict = "ok";
  if (!info.hasSvg || info.fullRect) verdict = "fail";
  else if (fx.id === "black-bg" && (!hasWhite || info.pathN < 20)) {
    // Dark-on-black: chroma keys the mark away — only debris / holes remain.
    verdict = "poor-on-black-bg";
  } else if (fx.expectGray && !hasGray) verdict = "missing-gray";
  else if (fx.expectWhite && !hasWhite) verdict = "missing-white";

  summary.push({ id: fx.id, verdict, ...info, hasGray, hasWhite, hasDark });
  console.log(fx.id, verdict, { pathN: info.pathN, fills: info.fills, hasGray, hasWhite });
  await page.close();
}

await browser.close();
const white = summary.find((s) => s.id === "white-bg");
const black = summary.find((s) => s.id === "black-bg");
if (!white || white.verdict !== "ok") {
  throw new Error(`white-bg fixture must pass Logo+gray; got ${JSON.stringify(white)}`);
}
if (!black || black.verdict === "fail") {
  throw new Error(`black-bg hard-failed unexpectedly: ${JSON.stringify(black)}`);
}
console.log("SMOKE_BAGGERO_FIXTURES_OK", summary.map((s) => `${s.id}:${s.verdict}`).join(" "));
