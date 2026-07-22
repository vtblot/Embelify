import { chromium } from "playwright";
import fs from "fs";
import zlib from "zlib";

/** Dark head + intentional white residue crumb on exterior chin. */
function writeResidueLogo(path) {
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
  const w = 180;
  const h = 180;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const i = y * (w * 4 + 1) + 1 + x * 4;
      const dx = x - 90;
      const dy = y - 90;
      const inHead = dx * dx + dy * dy <= 50 * 50;
      const fx = x - 48;
      const fy = y - 138;
      const residue = fx * fx + fy * fy <= 7 * 7 && !inHead;
      let r = 0;
      let g = 0;
      let b = 0;
      if (inHead) {
        // Must be > SOFT_DIST from black bg or soft-fringe+harden eats the body
        r = g = b = 80;
      } else if (residue) {
        r = g = b = 220; // white crumb the keyer "missed"
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

const fixture = "/tmp/residue-logo.png";
writeResidueLogo(fixture);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.goto("http://127.0.0.1:5173/", { waitUntil: "networkidle" });
await page.selectOption("#upscale", "1");
await page.evaluate(() => {
  document.getElementById("remove_bg").checked = true;
  document.getElementById("remove_bg").dispatchEvent(new Event("change", { bubbles: true }));
  document.getElementById("to_svg").checked = false;
  document.getElementById("bg_mode").value = "chroma";
  document.getElementById("bg_mode").dispatchEvent(new Event("change", { bubbles: true }));
  document.getElementById("edge_tighten").value = "tight";
  document.getElementById("edge_tighten").dispatchEvent(new Event("change", { bubbles: true }));
  document.getElementById("cut_scope").value = "exterior";
  document.getElementById("cut_scope").dispatchEvent(new Event("change", { bubbles: true }));
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
      s.includes("téléchargez"))
  );
}, { timeout: 90000 });

await page.waitForTimeout(200);

const stats = await page.evaluate(async () => {
  const img = document.getElementById("preview-img");
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height).data;
  let residueZone = 0;
  let headOpaque = 0;
  let lightEdge = 0;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      const i = (y * c.width + x) * 4;
      const a = data[i + 3];
      const L = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      const fx = x - 48;
      const fy = y - 138;
      if (fx * fx + fy * fy <= 9 * 9 && a > 16) residueZone += 1;
      const hx = x - 90;
      const hy = y - 90;
      if (hx * hx + hy * hy <= 30 * 30 && a > 200) headOpaque += 1;
      if (a > 200 && L > 150) {
        let touches = false;
        for (let dy = -1; dy <= 1 && !touches; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= c.width || ny >= c.height) {
              touches = true;
              break;
            }
            if (data[(ny * c.width + nx) * 4 + 3] < 16) {
              touches = true;
              break;
            }
          }
        }
        if (touches) lightEdge += 1;
      }
    }
  }
  return { residueZone, headOpaque, lightEdge };
});

console.log("stats", stats);
if (stats.headOpaque < 400) throw new Error("head removed");
if (stats.residueZone > 5) throw new Error("white residue not scrubbed: " + stats.residueZone);
if (stats.lightEdge > 20) throw new Error("light edge residue remains: " + stats.lightEdge);
console.log("RESIDUE_SCRUB_OK");
await browser.close();
