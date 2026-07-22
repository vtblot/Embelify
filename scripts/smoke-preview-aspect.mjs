/**
 * Preview frame follows source aspect; PNG export keeps native size when upscale=Off.
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

function writeWideLogo(path) {
  const w = 360;
  const h = 120;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const i = y * (w * 4 + 1) + 1 + x * 4;
      // black bg
      let r = 0;
      let g = 0;
      let b = 0;
      const inMark =
        x > 40 && x < 320 && y > 25 && y < 95 && !(x > 160 && x < 200 && y > 40 && y < 80);
      if (inMark) {
        r = g = b = 40;
      }
      // white eye-like hole
      if (x > 70 && x < 95 && y > 45 && y < 70) {
        r = g = b = 240;
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

const fixture = "/tmp/wide-logo-aspect.png";
writeWideLogo(fixture);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.selectOption("#upscale", "1");
await page.evaluate(() => {
  const rembg = document.getElementById("remove_bg");
  const svg = document.getElementById("to_svg");
  if (rembg instanceof HTMLInputElement) {
    rembg.checked = true;
    rembg.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (svg instanceof HTMLInputElement) {
    svg.checked = false;
    svg.dispatchEvent(new Event("change", { bubbles: true }));
  }
  document.getElementById("bg_mode").value = "chroma";
  document.getElementById("bg_mode").dispatchEvent(new Event("change", { bubbles: true }));
});
await page.setInputFiles("#file-input", fixture);

await page.waitForFunction(() => {
  const img = document.getElementById("preview-img");
  const ready =
    img instanceof HTMLImageElement &&
    !img.hidden &&
    img.naturalWidth > 0 &&
    !(document.getElementById("download-btn")?.disabled);
  const err = document.querySelector(".status.is-error");
  return ready || Boolean(err);
}, { timeout: 120000 });

const info = await page.evaluate(() => {
  const frame = document.querySelector(".preview-frame");
  const img = document.getElementById("preview-img");
  const ar = frame instanceof HTMLElement ? frame.style.getPropertyValue("--preview-ar").trim() : "";
  return {
    ar,
    naturalWidth: img instanceof HTMLImageElement ? img.naturalWidth : 0,
    naturalHeight: img instanceof HTMLImageElement ? img.naturalHeight : 0,
    label: document.getElementById("preview-label")?.textContent || "",
  };
});

console.log(info);
if (info.naturalWidth !== 360 || info.naturalHeight !== 120) {
  throw new Error(`Expected native 360×120 export/preview, got ${info.naturalWidth}×${info.naturalHeight}`);
}
if (!info.ar.includes("360") || !info.ar.includes("120")) {
  throw new Error(`Expected preview aspect 360/120, got "${info.ar}"`);
}
if (!info.label.includes("360×120")) {
  throw new Error(`Expected size in label, got "${info.label}"`);
}

console.log("SMOKE_PREVIEW_ASPECT_OK");
await browser.close();
