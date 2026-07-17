/** Solid / flat background removal via edge flood-fill + soft fringe. */

export type Rgb = readonly [number, number, number];

const HARD_DIST = 38; // clearly background
const SOFT_DIST = 72; // anti-aliased fringe toward bg

function dist2(r: number, g: number, b: number, bg: Rgb): number {
  const dr = r - bg[0];
  const dg = g - bg[1];
  const db = b - bg[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function sampleCorners(data: Uint8ClampedArray, w: number, h: number): Rgb {
  const pts = [
    0,
    (w - 1) * 4,
    (h - 1) * w * 4,
    ((h - 1) * w + (w - 1)) * 4,
  ];
  // Also sample near-corner insets (avoid 1px borders)
  const inset = Math.max(1, Math.min(8, Math.floor(Math.min(w, h) / 40)));
  pts.push(
    (inset * w + inset) * 4,
    (inset * w + (w - 1 - inset)) * 4,
    ((h - 1 - inset) * w + inset) * 4,
    ((h - 1 - inset) * w + (w - 1 - inset)) * 4,
  );

  let r = 0;
  let g = 0;
  let b = 0;
  for (const i of pts) {
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
  }
  const n = pts.length;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

/** True when image edges look like a flat graphic (uniform bg color). */
export function looksLikeFlatGraphic(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  const { width: w, height: h } = canvas;
  if (w < 4 || h < 4) return false;

  const { data } = ctx.getImageData(0, 0, w, h);
  const bg = sampleCorners(data, w, h);

  // Sample edge pixels; most should be near the corner color
  let edge = 0;
  let near = 0;
  const step = Math.max(1, Math.floor(Math.max(w, h) / 80));

  const check = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    edge += 1;
    if (dist2(data[i], data[i + 1], data[i + 2], bg) <= SOFT_DIST) near += 1;
  };

  for (let x = 0; x < w; x += step) {
    check(x, 0);
    check(x, h - 1);
  }
  for (let y = 0; y < h; y += step) {
    check(0, y);
    check(w - 1, y);
  }

  return near / edge >= 0.82;
}

/**
 * Remove the solid background connected to the image edges.
 * Correct for logos / aplats (ex: fond noir d’un morpion) — unlike photo AI.
 */
export function removeSolidBackground(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D indisponible.");

  const w = canvas.width;
  const h = canvas.height;
  const image = ctx.getImageData(0, 0, w, h);
  const { data } = image;
  const bg = sampleCorners(data, w, h);

  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let qh = 0;
  let qt = 0;

  const enqueue = (x: number, y: number) => {
    const idx = y * w + x;
    if (visited[idx]) return;
    const i = idx * 4;
    if (dist2(data[i], data[i + 1], data[i + 2], bg) > HARD_DIST) return;
    visited[idx] = 1;
    queue[qt++] = idx;
  };

  // Seed flood-fill from every edge pixel matching the background
  for (let x = 0; x < w; x++) {
    enqueue(x, 0);
    enqueue(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    enqueue(0, y);
    enqueue(w - 1, y);
  }

  while (qh < qt) {
    const idx = queue[qh++];
    const x = idx % w;
    const y = (idx / w) | 0;
    if (x > 0) enqueue(x - 1, y);
    if (x + 1 < w) enqueue(x + 1, y);
    if (y > 0) enqueue(x, y - 1);
    if (y + 1 < h) enqueue(x, y + 1);
  }

  // Punch fully transparent background
  for (let idx = 0; idx < visited.length; idx++) {
    if (!visited[idx]) continue;
    const i = idx * 4;
    data[i + 3] = 0;
  }

  // Soften anti-aliased fringe: near-bg pixels adjacent to cleared bg
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (visited[idx]) continue;
      const i = idx * 4;
      const d = dist2(data[i], data[i + 1], data[i + 2], bg);
      if (d >= SOFT_DIST) continue;

      // Only feather if touching a removed background pixel
      let touchesBg = false;
      for (let dy = -1; dy <= 1 && !touchesBg; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          if (visited[ny * w + nx]) {
            touchesBg = true;
            break;
          }
        }
      }
      if (!touchesBg) continue;

      // Map distance HARD→SOFT to alpha 0→original
      const t = (d - HARD_DIST) / (SOFT_DIST - HARD_DIST);
      const factor = Math.max(0, Math.min(1, t));
      data[i + 3] = Math.round(data[i + 3] * factor);
    }
  }

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const outCtx = out.getContext("2d");
  if (!outCtx) throw new Error("Canvas 2D indisponible.");
  outCtx.putImageData(image, 0, 0);
  return out;
}
