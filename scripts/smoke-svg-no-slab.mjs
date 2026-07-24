/**
 * Regression: Logo SVG must NOT fill the full viewBox as a black slab.
 * Root cause was transparent pixels becoming (0,0,0,0) after canvas round-trip,
 * then matching the black palette entry instead of a:0.
 */
import { chromium } from "playwright";
import fs from "fs";
import zlib from "zlib";

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const t = Buffer.from(type);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

function writeLogo(path) {
  const w = 320;
  const h = 160;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const i = y * (w * 4 + 1) + 1 + x * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      const dx = x - 70;
      const dy = y - 90;
      const inHead = dx * dx + dy * dy <= 45 * 45;
      const eyeL = (x - 55) * (x - 55) + (y - 85) * (y - 85) <= 8 * 8;
      const eyeR = (x - 85) * (x - 85) + (y - 85) * (y - 85) <= 8 * 8;
      const ox = x - 220;
      const oy = y - 80;
      const inO = ox * ox + oy * oy <= 35 * 35 && ox * ox + oy * oy >= 16 * 16;
      if (eyeL || eyeR) {
        r = g = b = 255;
        a = 255;
      } else if (inHead || inO) {
        r = g = b = 20;
        a = 255;
      }
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  fs.writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk("IHDR", ihdr),
      chunk("IDAT", zlib.deflateSync(raw)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

const fixture = "/tmp/smoke-no-slab.png";
writeLogo(fixture);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.evaluate(() => {
  const rembg = document.getElementById("remove_bg");
  const svg = document.getElementById("to_svg");
  if (rembg instanceof HTMLInputElement) {
    rembg.checked = false;
    rembg.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (svg instanceof HTMLInputElement) {
    svg.checked = true;
    svg.dispatchEvent(new Event("change", { bubbles: true }));
  }
});
await page.setInputFiles("#file-input", fixture);
await page.waitForFunction(() => document.querySelector("#preview-svg svg"), {
  timeout: 60000,
});

const info = await page.evaluate(() => {
  const svg = document.querySelector("#preview-svg svg");
  const vb = (svg.getAttribute("viewBox") || "").trim();
  const paths = [...svg.querySelectorAll("path")].map((p) => ({
    fill: (p.getAttribute("fill") || "").toLowerCase(),
    opacity: p.getAttribute("opacity"),
    d: p.getAttribute("d") || "",
  }));
  const black = paths.filter(
    (p) => p.fill === "#000000" || p.fill.includes("rgb(0,0,0)"),
  );
  const white = paths.filter(
    (p) => p.fill === "#ffffff" || p.fill.includes("255"),
  );
  const fullRect = black.some((p) =>
    /^M\s*0\s+0\s+L\s+\d+\s+0\s+L\s+\d+\s+\d+\s+L\s+0\s+\d+/i.test(p.d),
  );
  // Expect separate head + ring ink (two black paths) when geometry is healthy
  return {
    vb,
    blackN: black.length,
    whiteN: white.length,
    fullRect,
    blackStarts: black.map((p) => p.d.slice(0, 60)),
  };
});

console.log(info);
if (info.fullRect) throw new Error("Logo SVG filled the full viewBox (black slab)");
if (info.blackN < 2) throw new Error(`expected ≥2 black paths (head+ring), got ${info.blackN}`);
if (info.whiteN < 1) throw new Error("missing white eye fills");
console.log("SMOKE_NO_SLAB_OK");
await browser.close();
