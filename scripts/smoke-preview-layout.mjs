import { chromium } from "playwright";
import fs from "fs";
import zlib from "zlib";

/** Wide wordmark-like PNG to exercise preview layout. */
function writeWidePng(path, w, h) {
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
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const i = y * (w * 4 + 1) + 1 + x * 4;
      const on = x > 60 && x < w - 60 && y > 40 && y < h - 40;
      raw[i] = on ? 18 : 255;
      raw[i + 1] = on ? 18 : 255;
      raw[i + 2] = on ? 18 : 255;
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

const fixture = "/tmp/preview-layout-wide.png";
writeWidePng(fixture, 2048, 512);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.selectOption("#upscale", "1");
await page.evaluate(() => {
  document.getElementById("remove_bg").checked = true;
  document.getElementById("remove_bg").dispatchEvent(new Event("change", { bubbles: true }));
  document.getElementById("to_svg").checked = false;
  document.getElementById("bg_mode").value = "chroma";
  document.getElementById("bg_mode").dispatchEvent(new Event("change", { bubbles: true }));
});
await page.setInputFiles("#file-input", fixture);
await page.waitForFunction(() => {
  const btn = document.getElementById("download-btn");
  const s = document.getElementById("status")?.textContent || "";
  return (
    btn instanceof HTMLButtonElement &&
    !btn.disabled &&
    (s.includes("up to date") || s.includes("à jour"))
  );
}, { timeout: 90000 });

const layout = await page.evaluate(() => {
  const preview = document.getElementById("preview");
  const frame = document.querySelector(".preview-frame");
  const meta = document.querySelector(".preview-meta");
  const pipeline = document.querySelector(".pipeline");
  const download = document.getElementById("download-btn");
  const fr = frame.getBoundingClientRect();
  const mr = meta.getBoundingClientRect();
  const pl = pipeline.getBoundingClientRect();
  const pr = preview.getBoundingClientRect();
  const dr = download.getBoundingClientRect();
  const vh = window.innerHeight;
  return {
    frame: { w: fr.width, h: fr.height, x: fr.x, bottom: fr.bottom },
    preview: { w: pr.width, x: pr.x },
    pipelineRight: pl.right,
    metaTop: mr.top,
    downloadInView: dr.top >= 0 && dr.bottom <= vh && dr.left >= 0,
    overlapsPipeline: fr.left < pl.right - 4,
    overlapsMeta: fr.bottom > mr.top + 2,
    frameCenteredInPreview: Math.abs(fr.left + fr.width / 2 - (pr.left + pr.width / 2)) < 3,
    arN: getComputedStyle(frame).getPropertyValue("--preview-ar-n").trim(),
  };
});

console.log("layout", layout);
if (layout.overlapsPipeline) throw new Error("preview overlaps options column");
if (layout.overlapsMeta) throw new Error("preview frame overlaps download row");
if (!layout.downloadInView) throw new Error("download button not in viewport");
if (!layout.frameCenteredInPreview) throw new Error("frame not centered in preview column");
if (layout.frame.h > 540) throw new Error("frame too tall: " + layout.frame.h);
if (Number(layout.arN) < 3) throw new Error("expected wide AR, got " + layout.arN);

// Default/fallback must not explode into a huge square
const fallback = await page.evaluate(() => {
  const frame = document.querySelector(".preview-frame");
  frame.style.removeProperty("--preview-ar");
  frame.style.removeProperty("--preview-ar-n");
  const fr = frame.getBoundingClientRect();
  const pl = document.querySelector(".pipeline").getBoundingClientRect();
  const mr = document.querySelector(".preview-meta").getBoundingClientRect();
  return {
    w: fr.width,
    h: fr.height,
    overlapsPipeline: fr.left < pl.right - 4,
    overlapsMeta: fr.bottom > mr.top + 2,
  };
});
console.log("fallback", fallback);
if (fallback.h > 420) throw new Error("fallback frame too tall: " + fallback.h);
if (fallback.overlapsPipeline) throw new Error("fallback overlaps options");
if (fallback.overlapsMeta) throw new Error("fallback overlaps meta");

console.log("PREVIEW_LAYOUT_OK");
await browser.close();
