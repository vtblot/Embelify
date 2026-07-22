/**
 * BAGGERO-style dark cat mark: white eyes+nose, off-white ear triangle,
 * mid-gray face banding. Logo SVG must snap ear+bands to dark and keep eyes.
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

function writeCatLogo(path) {
  // Wider canvas: cat + letter "O" with white counter (wordmark holes)
  const w = 320;
  const h = 200;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const i = y * (w * 4 + 1) + 1 + x * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      const dx = x - 100;
      const dy = y - 110;
      const inHead = dx * dx + dy * dy <= 55 * 55;
      const inEarL =
        x >= 45 && x <= 80 && y >= 35 && y <= 85 && (x - 45) + (y - 85) * 0.55 <= 20;
      const inEarR =
        x >= 120 && x <= 155 && y >= 35 && y <= 85 && (155 - x) + (y - 85) * 0.55 <= 20;
      const falseEar =
        x >= 128 && x <= 148 && y >= 48 && y <= 72 && (148 - x) >= (y - 48) * 0.7;
      const faceBand = inHead && x > 100 && x < 145 && y > 90 && y < 140;
      const eyeL = (x - 78) * (x - 78) + (y - 105) * (y - 105) <= 9 * 9;
      const eyeR = (x - 122) * (x - 122) + (y - 105) * (y - 105) <= 9 * 9;
      const nose = (x - 100) * (x - 100) + (y - 128) * (y - 128) <= 6 * 6;
      // Letter O on the right: dark ring + white hole (must survive Logo SVG)
      const ox = x - 250;
      const oy = y - 100;
      const inORing = ox * ox + oy * oy <= 38 * 38 && ox * ox + oy * oy >= 18 * 18;
      const inOHole = ox * ox + oy * oy < 18 * 18;

      if (eyeL || eyeR || nose || inOHole) {
        r = g = b = 200;
      } else if (falseEar) {
        r = g = b = 230;
      } else if (faceBand) {
        r = g = b = 95;
      } else if (inHead || inEarL || inEarR || inORing) {
        r = g = b = 72;
      }
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = 255;
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

const fixture = "/tmp/baggero-like-logo.png";
writeCatLogo(fixture);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on("pageerror", (err) => console.log("PAGEERROR", err.message));

await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.selectOption("#upscale", "4");
await page.evaluate(() => {
  const rembg = document.getElementById("remove_bg");
  const svg = document.getElementById("to_svg");
  if (rembg instanceof HTMLInputElement) {
    rembg.checked = true;
    rembg.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (svg instanceof HTMLInputElement) {
    svg.checked = true;
    svg.dispatchEvent(new Event("change", { bubbles: true }));
  }
  document.getElementById("bg_mode").value = "chroma";
  document.getElementById("bg_mode").dispatchEvent(new Event("change", { bubbles: true }));
  document.getElementById("cut_scope").value = "exterior";
  document.getElementById("cut_scope").dispatchEvent(new Event("change", { bubbles: true }));
  document.getElementById("svg_style").value = "logo";
  document.getElementById("svg_style").dispatchEvent(new Event("change", { bubbles: true }));
  document.getElementById("svg_colors").value = "few";
  document.getElementById("svg_colors").dispatchEvent(new Event("change", { bubbles: true }));
});
await page.setInputFiles("#file-input", fixture);

await page.waitForFunction(() => {
  const svg = document.querySelector("#preview-svg svg");
  const s = document.getElementById("status")?.textContent || "";
  return Boolean(svg) || s.includes("Échec") || s.includes("failed") || Boolean(document.querySelector(".status.is-error"));
}, { timeout: 120000 });

const status = await page.textContent("#status");
const svgHtml = await page.locator("#preview-svg").innerHTML();
if (!svgHtml.includes("<svg") && !svgHtml.includes("<SVG")) {
  throw new Error("No SVG preview: " + status);
}

// Collect fill colors from path/style attributes
const fills = await page.evaluate(() => {
  const root = document.querySelector("#preview-svg svg");
  if (!root) return [];
  const out = new Set();
  const add = (c) => {
    if (!c || c === "none") return;
    out.add(String(c).trim().toLowerCase());
  };
  root.querySelectorAll("[fill]").forEach((el) => add(el.getAttribute("fill")));
  const style = root.getAttribute("style") || "";
  const m = style.match(/fill\s*:\s*([^;]+)/i);
  if (m) add(m[1]);
  // imagetracer often uses fill="rgb(r,g,b)"
  return [...out];
});

function lumaOfFill(fill) {
  const rgb = fill.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (rgb) {
    const r = +rgb[1];
    const g = +rgb[2];
    const b = +rgb[3];
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const hex = fill.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  return -1;
}

const lumas = fills.map(lumaOfFill).filter((L) => L >= 0);
// Mid-gray banding / off-white ear — not the dark body core (~18–80)
const midGray = lumas.filter((L) => L > 90 && L < 200);
const hasWhite = lumas.some((L) => L > 230);
const hasDark = lumas.some((L) => L > 0 && L <= 90);

console.log("fills", fills);
console.log("lumas", lumas);
console.log("status", status);

if (!hasDark) throw new Error("Logo SVG missing dark body fill");
if (!hasWhite) throw new Error("Logo SVG missing white feature fill (eyes/nose)");
if (midGray.length > 0) {
  throw new Error(`Logo SVG still has mid-gray fills (banding/ear): ${midGray.join(",")}`);
}
if (lumas.length > 5) {
  throw new Error(`Too many distinct fills for logo style: ${lumas.length}`);
}

console.log("SMOKE_LOGO_FLATTEN_OK");
await browser.close();
