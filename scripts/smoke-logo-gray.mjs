/**
 * Palette 4 must keep mid-gray face banding; palette 3 stays flat black.
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
      let a = 0;
      const dx = x - 100;
      const dy = y - 110;
      const inHead = dx * dx + dy * dy <= 55 * 55;
      const inEarL =
        x >= 45 && x <= 80 && y >= 35 && y <= 85 && (x - 45) + (y - 85) * 0.55 <= 20;
      const inEarR =
        x >= 120 && x <= 155 && y >= 35 && y <= 85 && (155 - x) + (y - 85) * 0.55 <= 20;
      const faceBand = inHead && x > 100 && x < 145 && y > 90 && y < 140;
      const eyeL = (x - 78) * (x - 78) + (y - 105) * (y - 105) <= 9 * 9;
      const eyeR = (x - 122) * (x - 122) + (y - 105) * (y - 105) <= 9 * 9;
      const nose = (x - 100) * (x - 100) + (y - 128) * (y - 128) <= 6 * 6;
      const ox = x - 250;
      const oy = y - 100;
      const inORing = ox * ox + oy * oy <= 38 * 38 && ox * ox + oy * oy >= 18 * 18;

      if (eyeL || eyeR || nose) {
        r = g = b = 200;
        a = 255;
      } else if (faceBand) {
        r = g = b = 95;
        a = 255;
      } else if (inHead || inEarL || inEarR || inORing) {
        r = g = b = 40;
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

function lumaOfFill(fill) {
  const rgb = fill.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (rgb) return 0.2126 * +rgb[1] + 0.7152 * +rgb[2] + 0.0722 * +rgb[3];
  const hex = fill.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!hex) return -1;
  let h = hex[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

async function runOnce(page, fixture, palette) {
  await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
  await page.evaluate((pal) => {
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
    document.getElementById("svg_mode").value = "logo";
    document.getElementById("svg_mode").dispatchEvent(new Event("change", { bubbles: true }));
    const detail = document.getElementById("svg_detail");
    const paletteEl = document.getElementById("svg_palette");
    if (detail instanceof HTMLInputElement) {
      detail.value = "7";
      detail.dispatchEvent(new Event("input", { bubbles: true }));
    }
    if (paletteEl instanceof HTMLInputElement) {
      paletteEl.value = String(pal);
      paletteEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }, palette);
  await page.setInputFiles("#file-input", fixture);
  await page.waitForFunction(() => document.querySelector("#preview-svg svg"), {
    timeout: 120000,
  });
  // Re-assert palette after load (auto-recipe / debounce can race), then recompute.
  await page.evaluate((pal) => {
    const paletteEl = document.getElementById("svg_palette");
    const modeEl = document.getElementById("svg_mode");
    if (modeEl instanceof HTMLSelectElement) {
      modeEl.value = "logo";
      modeEl.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (paletteEl instanceof HTMLInputElement) {
      paletteEl.value = String(pal);
      paletteEl.dispatchEvent(new Event("input", { bubbles: true }));
    }
    const recipe = document.querySelector(
      pal >= 4 ? '[data-svg-recipe="logo"]' : '[data-svg-recipe="logo-flat"]',
    );
    if (recipe instanceof HTMLButtonElement) recipe.click();
  }, palette);
  await page.waitForFunction(
    (pal) => {
      const svg = document.querySelector("#preview-svg svg");
      const status = document.getElementById("status")?.textContent || "";
      const cur = document.getElementById("svg_palette")?.value;
      const ready =
        status.includes("download") ||
        status.includes("télécharg") ||
        status.includes("ready") ||
        status.includes("à jour");
      return Boolean(svg) && ready && cur === String(pal);
    },
    palette,
    { timeout: 120000 },
  );
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const root = document.querySelector("#preview-svg svg");
    const out = new Set();
    root.querySelectorAll("[fill]").forEach((el) => {
      const c = el.getAttribute("fill");
      if (c && c !== "none") out.add(String(c).trim().toLowerCase());
    });
    // also scan inline style fills
    root.querySelectorAll("path").forEach((el) => {
      const s = el.getAttribute("style") || "";
      const m = s.match(/fill:\s*([^;]+)/i);
      if (m) out.add(m[1].trim().toLowerCase());
    });
    return {
      fills: [...out],
      palette: document.getElementById("svg_palette")?.value,
      mode: document.getElementById("svg_mode")?.value,
      pathN: root.querySelectorAll("path").length,
    };
  });
}

const fixture = "/tmp/baggero-gray-logo.png";
writeCatLogo(fixture);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

const grayResult = await runOnce(page, fixture, 4);
const grayFills = grayResult.fills;
const grayLumas = grayFills.map(lumaOfFill).filter((L) => L >= 0);
const hasMid = grayLumas.some((L) => L > 50 && L < 160);
console.log("palette4", grayResult, grayLumas);
if (!hasMid) throw new Error("palette 4 should keep mid-gray face banding");

const flatResult = await runOnce(page, fixture, 3);
const flatFills = flatResult.fills;
const flatLumas = flatFills.map(lumaOfFill).filter((L) => L >= 0);
const flatMid = flatLumas.filter((L) => L > 50 && L < 160);
console.log("palette3", flatResult, flatLumas);
if (flatMid.length > 0) throw new Error(`palette 3 should flatten grays: ${flatMid}`);

console.log("SMOKE_LOGO_GRAY_OK");
await browser.close();
