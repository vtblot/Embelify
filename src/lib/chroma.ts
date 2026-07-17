/** Solid / flat background removal via edge flood-fill + defringe. */

export type Rgb = readonly [number, number, number];

const HARD_DIST = 42; // clearly background
const SOFT_DIST = 96; // anti-aliased fringe toward bg
const FRINGE_LUMA = 55; // near-black halo cleanup

function dist2(r: number, g: number, b: number, bg: Rgb): number {
  const dr = r - bg[0];
  const dg = g - bg[1];
  const db = b - bg[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function sampleCorners(data: Uint8ClampedArray, w: number, h: number): Rgb {
  const pts = [
    0,
    (w - 1) * 4,
    (h - 1) * w * 4,
    ((h - 1) * w + (w - 1)) * 4,
  ];
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

function touchesTransparent(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  x: number,
  y: number,
  radius = 1,
): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return true;
      if (data[(ny * w + nx) * 4 + 3] < 16) return true;
    }
  }
  return false;
}

/**
 * Remove bg color spill from semi-transparent / edge pixels (kills black halos).
 */
function decontaminateEdges(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  bg: Rgb,
): void {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3];
      if (a === 0) continue;
      if (!touchesTransparent(data, w, h, x, y, 2)) continue;

      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const d = dist2(r, g, b, bg);

      // Partial alpha from soft fringe — un-premultiply bg contamination
      if (a < 250 || d < SOFT_DIST) {
        const alpha = a / 255;
        // Estimate how much bg is mixed in from color distance
        const mix = Math.max(0, 1 - d / SOFT_DIST);
        const strength = Math.min(1, mix * 0.95 + (1 - alpha) * 0.5);
        if (strength > 0.02) {
          data[i] = Math.round(Math.min(255, Math.max(0, (r - bg[0] * strength) / (1 - strength * 0.92))));
          data[i + 1] = Math.round(Math.min(255, Math.max(0, (g - bg[1] * strength) / (1 - strength * 0.92))));
          data[i + 2] = Math.round(Math.min(255, Math.max(0, (b - bg[2] * strength) / (1 - strength * 0.92))));
        }
      }

      // Near-black edge crumbs → drop
      if (luma(data[i], data[i + 1], data[i + 2]) < FRINGE_LUMA && d < SOFT_DIST + 20) {
        data[i + 3] = 0;
      }
    }
  }
}

/**
 * Contract the opaque matte by `radius` pixels (morphological erosion).
 * Equivalent to “cropping” fringe pixels around every shape — kills black AA crumbs.
 */
function erodeAlpha(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
): void {
  if (radius <= 0) return;
  let current = new Uint8Array(w * h);
  for (let i = 0; i < current.length; i++) {
    current[i] = data[i * 4 + 3] > 16 ? 1 : 0;
  }

  for (let pass = 0; pass < radius; pass++) {
    const next = new Uint8Array(current);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (!current[idx]) continue;
        let keep = true;
        for (let dy = -1; dy <= 1 && keep; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h || !current[ny * w + nx]) {
              keep = false;
              break;
            }
          }
        }
        if (!keep) next[idx] = 0;
      }
    }
    current = next;
  }

  for (let i = 0; i < current.length; i++) {
    if (!current[i]) data[i * 4 + 3] = 0;
  }
}

/**
 * After erosion, repaint the new edge with interior colors so contours stay uniform.
 */
function recolorEdgesFromInterior(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): void {
  const src = new Uint8ClampedArray(data);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (src[i + 3] < 16) continue;
      if (!touchesTransparent(src, w, h, x, y, 1)) continue;

      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      // Prefer neighbors that are fully inside (not on the transparent border)
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = (ny * w + nx) * 4;
          if (src[ni + 3] < 200) continue;
          if (touchesTransparent(src, w, h, nx, ny, 1)) continue;
          r += src[ni];
          g += src[ni + 1];
          b += src[ni + 2];
          n += 1;
        }
      }
      if (n === 0) {
        // Fallback: any opaque neighbor
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = (ny * w + nx) * 4;
            if (src[ni + 3] < 200) continue;
            r += src[ni];
            g += src[ni + 1];
            b += src[ni + 2];
            n += 1;
          }
        }
      }
      if (n > 0) {
        data[i] = Math.round(r / n);
        data[i + 1] = Math.round(g / n);
        data[i + 2] = Math.round(b / n);
        data[i + 3] = 255;
      }
    }
  }
}

/**
 * Remove thin dark outlines left on shapes (AA against a dark bg / upscale halo).
 * Only touches near-black pixels whose neighbors are mostly bright or transparent.
 */
function cleanDarkHalos(data: Uint8ClampedArray, w: number, h: number): void {
  const snapshot = new Uint8ClampedArray(data);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = (y * w + x) * 4;
      if (snapshot[i + 3] < 16) continue;

      const L = luma(snapshot[i], snapshot[i + 1], snapshot[i + 2]);
      if (L > FRINGE_LUMA) continue;

      let brightR = 0;
      let brightG = 0;
      let brightB = 0;
      let brightN = 0;
      let transparentN = 0;
      let darkN = 0;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const ni = ((y + dy) * w + (x + dx)) * 4;
          if (snapshot[ni + 3] < 16) {
            transparentN += 1;
            continue;
          }
          const nL = luma(snapshot[ni], snapshot[ni + 1], snapshot[ni + 2]);
          if (nL < FRINGE_LUMA + 10) {
            darkN += 1;
          } else {
            brightR += snapshot[ni];
            brightG += snapshot[ni + 1];
            brightB += snapshot[ni + 2];
            brightN += 1;
          }
        }
      }

      // Thin dark fringe: few dark neighbors, surrounded by bright/transparent
      if (darkN <= 3 && (brightN >= 2 || transparentN >= 2)) {
        if (transparentN >= 3 && brightN === 0) {
          data[i + 3] = 0;
        } else if (brightN > 0) {
          data[i] = Math.round(brightR / brightN);
          data[i + 1] = Math.round(brightG / brightN);
          data[i + 2] = Math.round(brightB / brightN);
        }
      }
    }
  }
}

/**
 * Remove the solid background connected to the image edges.
 * Correct for logos / aplats (ex: fond noir d’un morpion) — unlike photo cutout.
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

  for (let idx = 0; idx < visited.length; idx++) {
    if (!visited[idx]) continue;
    data[idx * 4 + 3] = 0;
  }

  // Soft fringe on pixels touching removed bg
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (visited[idx]) continue;
      const i = idx * 4;
      const d = dist2(data[i], data[i + 1], data[i + 2], bg);
      if (d >= SOFT_DIST) continue;

      let touchesBg = false;
      for (let dy = -2; dy <= 2 && !touchesBg; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
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

      const t = (d - HARD_DIST) / (SOFT_DIST - HARD_DIST);
      const factor = Math.max(0, Math.min(1, t));
      data[i + 3] = Math.round(data[i + 3] * factor * factor);
    }
  }

  decontaminateEdges(data, w, h, bg);
  cleanDarkHalos(data, w, h);
  decontaminateEdges(data, w, h, bg);

  // Crop ~1–2 fringe pixels around every shape, then unify edge colors
  erodeAlpha(data, w, h, 2);
  recolorEdgesFromInterior(data, w, h);
  cleanDarkHalos(data, w, h);

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const outCtx = out.getContext("2d");
  if (!outCtx) throw new Error("Canvas 2D indisponible.");
  outCtx.putImageData(image, 0, 0);
  return out;
}
