import { chromium } from "playwright";
import fs from "fs";
import zlib from "zlib";

/**
 * Wordmark fixture: black cat head with small white eyes + letter “O” with a large
 * white counter, on a white background. Exterior chroma must keep eyes and open the O.
 */
function writeWordmarkPng(path) {
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

  const w = 400;
  const h = 160;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const i = y * (w * 4 + 1) + 1 + x * 4;
      // Head
      const dx = x - 70;
      const dy = y - 80;
      const inHead = dx * dx + dy * dy <= 52 * 52;
      const inEyeL = (x - 52) * (x - 52) + (y - 70) * (y - 70) <= 7 * 7;
      const inEyeR = (x - 88) * (x - 88) + (y - 70) * (y - 70) <= 7 * 7;
      // Letter O: ring centered at (260, 80)
      const ox = x - 260;
      const oy = y - 80;
      const r2 = ox * ox + oy * oy;
      const inOStroke = r2 <= 48 * 48 && r2 >= 28 * 28;
      const inOHole = r2 < 28 * 28;

      let r = 255;
      let g = 255;
      let b = 255;
      if (inEyeL || inEyeR || inOHole) {
        r = g = b = 250;
      } else if (inHead || inOStroke) {
        r = g = b = 18;
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

const fixture = "/tmp/wordmark-letter-holes.png";
writeWordmarkPng(fixture);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.selectOption("#upscale", "1");
await page.evaluate(() => {
  const rembg = document.getElementById("remove_bg");
  rembg.checked = true;
  rembg.dispatchEvent(new Event("change", { bubbles: true }));
  document.getElementById("to_svg").checked = false;
  document.getElementById("bg_mode").value = "chroma";
  document.getElementById("bg_mode").dispatchEvent(new Event("change", { bubbles: true }));
  document.getElementById("cut_scope").value = "exterior";
  document.getElementById("cut_scope").dispatchEvent(new Event("change", { bubbles: true }));
  document.getElementById("edge_tighten").value = "tight";
  document.getElementById("edge_tighten").dispatchEvent(new Event("change", { bubbles: true }));
});
await page.setInputFiles("#file-input", fixture);
await page.waitForFunction(() => {
  const btn = document.getElementById("download-btn");
  const s = document.getElementById("status")?.textContent || "";
  return (
    btn instanceof HTMLButtonElement &&
    !btn.disabled &&
    (s.includes("up to date") ||
      s.includes("à jour") ||
      s.includes("Download") ||
      s.includes("téléchargez") ||
      s.includes("READY") ||
      s.includes("télécharg"))
  );
}, { timeout: 90000 });

const stats = await page.evaluate(async () => {
  const img = document.getElementById("preview-img");
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const eyeL = ctx.getImageData(52, 70, 1, 1).data;
  const eyeR = ctx.getImageData(88, 70, 1, 1).data;
  const oHole = ctx.getImageData(260, 80, 1, 1).data;
  const oStroke = ctx.getImageData(260, 80 - 38, 1, 1).data;
  const corner = ctx.getImageData(0, 0, 1, 1).data;
  const frame = document.querySelector(".preview-frame");
  const preview = document.querySelector(".preview");
  const frameCs = getComputedStyle(frame);
  const previewCs = getComputedStyle(preview);
  return {
    eyeL: [...eyeL],
    eyeR: [...eyeR],
    oHole: [...oHole],
    oStroke: [...oStroke],
    cornerA: corner[3],
    frameMaxH: frameCs.maxHeight,
    previewJustify: previewCs.justifyContent,
    previewMinH: previewCs.minHeight,
  };
});

console.log("stats", stats);
if (stats.cornerA !== 0) throw new Error("bg not removed");
if (stats.eyeL[3] < 200 || stats.eyeL[0] < 200) throw new Error("left eye lost: " + stats.eyeL);
if (stats.eyeR[3] < 200 || stats.eyeR[0] < 200) throw new Error("right eye lost: " + stats.eyeR);
if (stats.oHole[3] > 40) throw new Error("O counter still opaque: " + stats.oHole);
if (stats.oStroke[3] < 200 || stats.oStroke[0] > 80) {
  throw new Error("O stroke damaged: " + stats.oStroke);
}
if (!stats.previewJustify.includes("center")) {
  throw new Error("preview not vertically centered: " + stats.previewJustify);
}

console.log("LETTER_HOLES_OK");
await browser.close();
