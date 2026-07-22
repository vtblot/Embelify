import { chromium } from "playwright";
import fs from "fs";
import zlib from "zlib";

/** Black head + two white eyes on black bg — AI often punches eyes; exterior must keep them. */
function writeEyeLogo(path) {
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
  const w = 160;
  const h = 160;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const i = y * (w * 4 + 1) + 1 + x * 4;
      const dx = x - 80;
      const dy = y - 85;
      const inHead = dx * dx + dy * dy <= 48 * 48;
      const inEyeL = (x - 62) * (x - 62) + (y - 78) * (y - 78) <= 8 * 8;
      const inEyeR = (x - 98) * (x - 98) + (y - 78) * (y - 78) <= 8 * 8;
      let r = 0;
      let g = 0;
      let b = 0;
      if (inEyeL || inEyeR) {
        r = g = b = 245;
      } else if (inHead) {
        r = g = b = 22;
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

const fixture = "/tmp/eye-logo.png";
writeEyeLogo(fixture);

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
  document.getElementById("edge_tighten").value = "normal";
  document.getElementById("edge_tighten").dispatchEvent(new Event("change", { bubbles: true }));
});
await page.setInputFiles("#file-input", fixture);
await page.waitForFunction(() => {
  const btn = document.getElementById("download-btn");
  const s = document.getElementById("status")?.textContent || "";
  return (
    btn instanceof HTMLButtonElement &&
    !btn.disabled &&
    (s.includes("up to date") || s.includes("à jour") || s.includes("Download") || s.includes("téléchargez"))
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
  const eyeL = ctx.getImageData(62, 78, 1, 1).data;
  const eyeR = ctx.getImageData(98, 78, 1, 1).data;
  const corner = ctx.getImageData(0, 0, 1, 1).data;
  return {
    eyeL: [eyeL[0], eyeL[1], eyeL[2], eyeL[3]],
    eyeR: [eyeR[0], eyeR[1], eyeR[2], eyeR[3]],
    cornerA: corner[3],
    hasScope: Boolean(document.getElementById("cut_scope")),
  };
});

console.log("stats", stats);
if (!stats.hasScope) throw new Error("cut_scope control missing");
if (stats.cornerA !== 0) throw new Error("bg not removed");
if (stats.eyeL[3] < 200 || stats.eyeL[0] < 200) throw new Error("left eye lost: " + stats.eyeL);
if (stats.eyeR[3] < 200 || stats.eyeR[0] < 200) throw new Error("right eye lost: " + stats.eyeR);

// Simulate AI punching the left eye, then exterior restore via page helpers
const restored = await page.evaluate(async () => {
  const img = document.getElementById("preview-img");
  await img.decode();
  // Build original (with eyes) and damaged cutout (left eye hole)
  const orig = document.createElement("canvas");
  orig.width = 160;
  orig.height = 160;
  const octx = orig.getContext("2d");
  // redraw fixture from pixels we know
  const o = octx.createImageData(160, 160);
  for (let y = 0; y < 160; y++) {
    for (let x = 0; x < 160; x++) {
      const i = (y * 160 + x) * 4;
      const dx = x - 80;
      const dy = y - 85;
      const inHead = dx * dx + dy * dy <= 48 * 48;
      const inEyeL = (x - 62) * (x - 62) + (y - 78) * (y - 78) <= 8 * 8;
      const inEyeR = (x - 98) * (x - 98) + (y - 78) * (y - 78) <= 8 * 8;
      if (inEyeL || inEyeR) {
        o.data[i] = o.data[i + 1] = o.data[i + 2] = 245;
        o.data[i + 3] = 255;
      } else if (inHead) {
        o.data[i] = o.data[i + 1] = o.data[i + 2] = 22;
        o.data[i + 3] = 255;
      } else {
        o.data[i + 3] = 0;
      }
    }
  }
  octx.putImageData(o, 0, 0);

  const cut = document.createElement("canvas");
  cut.width = 160;
  cut.height = 160;
  const cctx = cut.getContext("2d");
  cctx.drawImage(orig, 0, 0);
  // Punch left eye (AI mistake) + darken as ghost
  const cd = cctx.getImageData(0, 0, 160, 160);
  for (let y = 70; y < 90; y++) {
    for (let x = 54; x < 72; x++) {
      if ((x - 62) * (x - 62) + (y - 78) * (y - 78) <= 8 * 8) {
        const i = (y * 160 + x) * 4;
        cd.data[i] = 40;
        cd.data[i + 1] = 40;
        cd.data[i + 2] = 40;
        cd.data[i + 3] = 0;
      }
    }
  }
  cctx.putImageData(cd, 0, 0);

  // Inline exterior restore (mirrors applyCutScope)
  const c = cctx.getImageData(0, 0, 160, 160);
  const org = octx.getImageData(0, 0, 160, 160);
  const exterior = new Uint8Array(160 * 160);
  const queue = new Int32Array(160 * 160);
  let qh = 0;
  let qt = 0;
  const enq = (x, y) => {
    const idx = y * 160 + x;
    if (exterior[idx]) return;
    if (c.data[idx * 4 + 3] >= 28) return;
    exterior[idx] = 1;
    queue[qt++] = idx;
  };
  for (let x = 0; x < 160; x++) {
    enq(x, 0);
    enq(x, 159);
  }
  for (let y = 0; y < 160; y++) {
    enq(0, y);
    enq(159, y);
  }
  while (qh < qt) {
    const idx = queue[qh++];
    const x = idx % 160;
    const y = (idx / 160) | 0;
    if (x > 0) enq(x - 1, y);
    if (x + 1 < 160) enq(x + 1, y);
    if (y > 0) enq(x, y - 1);
    if (y + 1 < 160) enq(x, y + 1);
  }
  for (let i = 0; i < 160 * 160; i++) {
    const j = i * 4;
    if (exterior[i]) {
      c.data[j + 3] = 0;
      continue;
    }
    const oA = org.data[j + 3];
    const cA = c.data[j + 3];
    const oL = 0.2126 * org.data[j] + 0.7152 * org.data[j + 1] + 0.0722 * org.data[j + 2];
    const cL = 0.2126 * c.data[j] + 0.7152 * c.data[j + 1] + 0.0722 * c.data[j + 2];
    if (oA > 16 && (cA < 28 || (oA > 200 && oL > 170 && (cA < 200 || cL < oL - 50)))) {
      c.data[j] = org.data[j];
      c.data[j + 1] = org.data[j + 1];
      c.data[j + 2] = org.data[j + 2];
      c.data[j + 3] = 255;
    }
  }
  const eye = c.data[(78 * 160 + 62) * 4];
  const eyeA = c.data[(78 * 160 + 62) * 4 + 3];
  return { eye, eyeA };
});

console.log("restored", restored);
if (restored.eyeA < 200 || restored.eye < 200) throw new Error("exterior restore failed");

console.log("CUT_SCOPE_OK");
await browser.close();
