import { chromium } from "playwright";
import fs from "fs";
import zlib from "zlib";

/** Dark cat-like logo on black with a light washed smudge at bottom-left. */
function writeCatFringePng(path) {
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

  const w = 200;
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
      const dy = y - 100;
      const inHead = dx * dx + dy * dy <= 55 * 55;
      const inEarL = (x - 70) * (x - 70) + (y - 45) * (y - 45) <= 18 * 18;
      const inEarR = (x - 130) * (x - 130) + (y - 45) * (y - 45) <= 18 * 18;
      const inShape = inHead || inEarL || inEarR;
      const fx = x - 55;
      const fy = y - 145;
      const fringe = fx * fx + fy * fy <= 12 * 12 && !inShape;
      if (inShape) {
        const t = Math.max(0, Math.min(1, (x - 70) / 80));
        const base = 28 + Math.round(t * 90);
        r = base;
        g = base;
        b = base + (t > 0.5 ? 8 : 0);
      } else if (fringe) {
        r = 175;
        g = 178;
        b = 185;
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
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  fs.writeFileSync(path, png);
}

const fixture = "/tmp/cat-fringe-smoke.png";
writeCatFringePng(fixture);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.selectOption("#upscale", "1");
await page.evaluate(() => {
  const rembg = document.getElementById("remove_bg");
  const svg = document.getElementById("to_svg");
  const mode = document.getElementById("bg_mode");
  if (rembg instanceof HTMLInputElement) {
    rembg.checked = true;
    rembg.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (svg instanceof HTMLInputElement) {
    svg.checked = false;
    svg.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (mode instanceof HTMLSelectElement) {
    mode.value = "chroma";
    mode.dispatchEvent(new Event("change", { bubbles: true }));
  }
});
await page.setInputFiles("#file-input", fixture);

await page.waitForFunction(() => {
  const btn = document.getElementById("download-btn");
  const s = document.getElementById("status")?.textContent || "";
  const ready =
    btn instanceof HTMLButtonElement &&
    !btn.disabled &&
    (s.includes("téléchargez") ||
      s.includes("Download") ||
      s.includes("à jour") ||
      s.includes("up to date"));
  const fail =
    s.includes("Échec") ||
    s.toLowerCase().includes("fail") ||
    Boolean(document.querySelector(".status.is-error"));
  return ready || fail;
}, { timeout: 90000 });

const status = await page.textContent("#status");
console.log("status", status);
if (status?.includes("Échec") || status?.toLowerCase().includes("fail")) {
  throw new Error(status || "fail");
}

const stats = await page.evaluate(async () => {
  const img = document.getElementById("preview-img");
  if (!(img instanceof HTMLImageElement) || !img.src) throw new Error("no preview");
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  let fringeZoneOpaque = 0;
  let headOpaque = 0;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const a = data[i + 3];
      const dx = x - 55;
      const dy = y - 145;
      if (dx * dx + dy * dy <= 14 * 14 && a > 16) fringeZoneOpaque += 1;
      const hx = x - 100;
      const hy = y - 100;
      if (hx * hx + hy * hy <= 30 * 30 && a > 200) headOpaque += 1;
    }
  }
  return { fringeZoneOpaque, headOpaque };
});

console.log("stats", stats);
if (stats.headOpaque < 500) throw new Error("logo body removed");
if (stats.fringeZoneOpaque > 5) {
  throw new Error("washed fringe remains: " + stats.fringeZoneOpaque);
}

console.log("CHROMA_FRINGE_OK");
await browser.close();
