import { chromium } from "playwright";
import fs from "fs";
import zlib from "zlib";

/** Build a tic-tac-toe-like PNG: black bg, cream cells, green ring. */
function writeBoardPng(path) {
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

  const w = 120;
  const h = 120;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const i = y * (w * 4 + 1) + 1 + x * 4;
      // cream cell?
      const col = Math.floor((x - 6) / 38);
      const row = Math.floor((y - 6) / 38);
      const lx = x - (6 + col * 38);
      const ly = y - (6 + row * 38);
      const inCell =
        col >= 0 && col < 3 && row >= 0 && row < 3 && lx >= 0 && lx < 32 && ly >= 0 && ly < 32;

      // green ring centered in bottom-middle cell (~60, 98)
      const dx = x - 60;
      const dy = y - 98;
      const r2 = dx * dx + dy * dy;
      const onRing = r2 <= 12 * 12 && r2 >= 7 * 7;

      if (onRing) {
        raw[i] = 0;
        raw[i + 1] = 184;
        raw[i + 2] = 99;
        raw[i + 3] = 255;
      } else if (inCell) {
        raw[i] = 242;
        raw[i + 1] = 236;
        raw[i + 2] = 233;
        raw[i + 3] = 255;
      } else {
        raw[i] = 0;
        raw[i + 1] = 0;
        raw[i + 2] = 0;
        raw[i + 3] = 255;
      }
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

writeBoardPng("/tmp/board-chroma.png");

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
// Capture the download
/** @type {import('playwright').Download | null} */
let download = null;
page.on("download", (d) => {
  download = d;
});

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
await page.setInputFiles("#file-input", "/tmp/board-chroma.png");

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

// Inspect preview pixels via canvas draw
const stats = await page.evaluate(async () => {
  const img = document.getElementById("preview-img");
  if (!(img instanceof HTMLImageElement) || !img.src) throw new Error("no preview");
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const corner = ctx.getImageData(0, 0, 1, 1).data;
  const cell = ctx.getImageData(20, 20, 1, 1).data;
  const hole = ctx.getImageData(60, 98, 1, 1).data;
  // count opaque black-ish pixels
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  let opaqueBlack = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] > 200 && data[i] < 20 && data[i + 1] < 20 && data[i + 2] < 20) {
      opaqueBlack += 1;
    }
  }
  return {
    cornerAlpha: corner[3],
    cellAlpha: cell[3],
    holeAlpha: hole[3],
    holeRgb: [hole[0], hole[1], hole[2]],
    opaqueBlack,
  };
});

console.log("stats", stats);
if (stats.cornerAlpha !== 0) throw new Error("corner not transparent");
if (stats.cellAlpha < 200) throw new Error("cell became transparent");
if (stats.holeAlpha < 200) throw new Error("ring hole punched out");
if (stats.opaqueBlack > 50) throw new Error("black background remains: " + stats.opaqueBlack);

console.log("CHROMA_UI_OK");
await browser.close();
