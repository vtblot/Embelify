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
  // Sample along the border (not just 8 points) and take a robust median-ish
  // average of the most common cluster — avoids subject-in-corner contamination.
  const samples: number[] = [];
  const step = Math.max(1, Math.floor(Math.max(w, h) / 64));

  for (let x = 0; x < w; x += step) {
    samples.push(0 * w + x);
    samples.push((h - 1) * w + x);
  }
  for (let y = step; y < h - step; y += step) {
    samples.push(y * w + 0);
    samples.push(y * w + (w - 1));
  }

  const colors: Rgb[] = samples.map((idx) => {
    const i = idx * 4;
    return [data[i], data[i + 1], data[i + 2]] as Rgb;
  });
  if (colors.length === 0) return [0, 0, 0];

  // Pick the sample with the most near-neighbors as cluster center (mode proxy)
  let bestIdx = 0;
  let bestCount = -1;
  for (let i = 0; i < colors.length; i++) {
    let count = 0;
    for (let j = 0; j < colors.length; j++) {
      if (dist2(colors[j][0], colors[j][1], colors[j][2], colors[i]) <= HARD_DIST) {
        count += 1;
      }
    }
    if (count > bestCount) {
      bestCount = count;
      bestIdx = i;
    }
  }

  const center = colors[bestIdx];
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const c of colors) {
    if (dist2(c[0], c[1], c[2], center) <= HARD_DIST) {
      r += c[0];
      g += c[1];
      b += c[2];
      n += 1;
    }
  }
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
 * Prefer dark/mid interior samples — never pull washed light fringe back onto a dark logo.
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
      let darkR = 0;
      let darkG = 0;
      let darkB = 0;
      let darkN = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = (ny * w + nx) * 4;
          if (src[ni + 3] < 200) continue;
          if (touchesTransparent(src, w, h, nx, ny, 1)) continue;
          const nL = luma(src[ni], src[ni + 1], src[ni + 2]);
          r += src[ni];
          g += src[ni + 1];
          b += src[ni + 2];
          n += 1;
          if (nL < 130) {
            darkR += src[ni];
            darkG += src[ni + 1];
            darkB += src[ni + 2];
            darkN += 1;
          }
        }
      }
      if (darkN > 0) {
        data[i] = Math.round(darkR / darkN);
        data[i + 1] = Math.round(darkG / darkN);
        data[i + 2] = Math.round(darkB / darkN);
        data[i + 3] = 255;
      } else if (n > 0) {
        data[i] = Math.round(r / n);
        data[i + 1] = Math.round(g / n);
        data[i + 2] = Math.round(b / n);
        data[i + 3] = 255;
      }
    }
  }
}

/**
 * Peel light / washed fringe off dark silhouettes (gray-white smudges on logos).
 * Walks inward from transparency through light pixels only, and stops at the dark body.
 * Skipped for bright subjects on dark bg (cream cells, white icons) so they stay intact.
 */
function peelLightFringeFromDarkSubjects(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  bg: Rgb | null,
  opts: { lightThreshold?: number } = {},
): void {
  // After AI cutout there is no solid bg — still peel light fringe on dark logos.
  if (bg) {
    const bgL = luma(bg[0], bg[1], bg[2]);
    if (bgL > 90) return;
  }

  const LIGHT = opts.lightThreshold ?? 140;
  const DARK = 90;

  let darkOpaque = 0;
  let brightOpaque = 0;
  let totalOpaque = 0;
  let lumaSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 200) continue;
    totalOpaque += 1;
    const L = luma(data[i], data[i + 1], data[i + 2]);
    lumaSum += L;
    if (L < DARK) darkOpaque += 1;
    else if (L > LIGHT) brightOpaque += 1;
  }
  if (totalOpaque < 16) return;
  const meanL = lumaSum / totalOpaque;
  // Cream / white logo — peeling would erase the subject
  if (brightOpaque / totalOpaque > 0.55 || meanL > 165) return;
  // Need a real dark body (allow gray-shaded logos: dark can be ~20%+)
  if (darkOpaque / totalOpaque < 0.18 && meanL > 110) return;

  const remove = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let qh = 0;
  let qt = 0;

  const trySeed = (x: number, y: number) => {
    const idx = y * w + x;
    if (remove[idx]) return;
    const i = idx * 4;
    if (data[i + 3] < 16) return;
    const L = luma(data[i], data[i + 1], data[i + 2]);
    if (L < LIGHT && data[i + 3] >= 160) return;
    if (!touchesTransparent(data, w, h, x, y, 1)) return;
    remove[idx] = 1;
    queue[qt++] = idx;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) trySeed(x, y);
  }

  while (qh < qt) {
    const idx = queue[qh++];
    const x = idx % w;
    const y = (idx / w) | 0;
    const neigh = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ] as const;
    for (const [nx, ny] of neigh) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const nidx = ny * w + nx;
      if (remove[nidx]) continue;
      const ni = nidx * 4;
      if (data[ni + 3] < 16) continue;
      const nL = luma(data[ni], data[ni + 1], data[ni + 2]);
      const soft = data[ni + 3] < 160;
      if (!soft && nL < LIGHT) continue;
      remove[nidx] = 1;
      queue[qt++] = nidx;
    }
  }

  let removeCount = 0;
  for (let i = 0; i < remove.length; i++) if (remove[i]) removeCount += 1;
  // Abort only if we'd wipe the subject (was 0.2 — too tight for thick fringe outlines)
  if (removeCount > totalOpaque * 0.35) return;

  for (let i = 0; i < remove.length; i++) {
    if (remove[i]) data[i * 4 + 3] = 0;
  }
}

/**
 * Eat thin exterior spurs / arcs (e.g. leftover ring fragments under a chin).
 * Iteratively drops opaque edge pixels that have very few opaque neighbors.
 */
function erodeThinSpurs(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  passes: number,
): void {
  for (let pass = 0; pass < passes; pass++) {
    const snapshot = new Uint8ClampedArray(data);
    let changed = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (snapshot[i + 3] < 16) continue;
        if (!touchesTransparent(snapshot, w, h, x, y, 1)) continue;

        let opaqueN = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            if (snapshot[(ny * w + nx) * 4 + 3] >= 16) opaqueN += 1;
          }
        }
        // Spur / thin arc tip: almost no body around it
        if (opaqueN <= 3) {
          data[i + 3] = 0;
          changed += 1;
        }
      }
    }
    if (changed === 0) break;
  }
}

/**
 * Drop tiny speck islands only — keep secondary logo parts (dots on “i”, badges).
 * Previously maxKeepRatio 0.02 / min 12 ate multi-component marks.
 */
function dropSmallIslands(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  maxKeepRatio = 0.005,
): void {
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  type Comp = { idxs: number[] };
  const comps: Comp[] = [];
  let totalOpaque = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const start = y * w + x;
      if (seen[start]) continue;
      if (data[start * 4 + 3] < 16) {
        seen[start] = 1;
        continue;
      }
      let qh = 0;
      let qt = 0;
      queue[qt++] = start;
      seen[start] = 1;
      const idxs: number[] = [];
      while (qh < qt) {
        const idx = queue[qh++];
        idxs.push(idx);
        const cx = idx % w;
        const cy = (idx / w) | 0;
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const nidx = ny * w + nx;
          if (seen[nidx]) continue;
          seen[nidx] = 1;
          if (data[nidx * 4 + 3] < 16) continue;
          queue[qt++] = nidx;
        }
      }
      totalOpaque += idxs.length;
      comps.push({ idxs });
    }
  }

  if (comps.length <= 1 || totalOpaque < 32) return;
  comps.sort((a, b) => b.idxs.length - a.idxs.length);
  const main = comps[0].idxs.length;
  // Only drop dust: < 0.5% of main and under 64 px (was 2% / 12 — too aggressive)
  const minKeep = Math.max(64, Math.floor(main * maxKeepRatio));
  for (let c = 1; c < comps.length; c++) {
    if (comps[c].idxs.length < minKeep) {
      for (const idx of comps[c].idxs) data[idx * 4 + 3] = 0;
    }
  }
}

/**
 * Drop thin washed edge crumbs after un-premultiply (1–2 px gray haze).
 */
function cleanWashedFringe(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  bg: Rgb | null,
): void {
  if (bg) {
    const bgL = luma(bg[0], bg[1], bg[2]);
    if (bgL > 90) return;
  }

  const snapshot = new Uint8ClampedArray(data);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = snapshot[i + 3];
      if (a < 8) continue;
      if (!touchesTransparent(snapshot, w, h, x, y, 2)) continue;

      const L = luma(snapshot[i], snapshot[i + 1], snapshot[i + 2]);

      let darkN = 0;
      let brightN = 0;
      let transparentN = 0;

      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
            transparentN += 1;
            continue;
          }
          const ni = (ny * w + nx) * 4;
          if (snapshot[ni + 3] < 16) {
            transparentN += 1;
            continue;
          }
          const nL = luma(snapshot[ni], snapshot[ni + 1], snapshot[ni + 2]);
          if (nL < 70) darkN += 1;
          else if (nL > 140) brightN += 1;
        }
      }

      if (a < 160 && transparentN >= 3) {
        data[i + 3] = 0;
        continue;
      }

      if (L > 140 && transparentN >= 2 && darkN >= 1 && brightN <= 6) {
        data[i + 3] = 0;
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
 * Logos look best with a hard matte: soft alpha reads as gray/white haze
 * on the checkerboard. Snap every pixel to fully transparent or opaque.
 */
function hardenMatte(data: Uint8ClampedArray, threshold: number): void {
  for (let i = 3; i < data.length; i += 4) {
    data[i] = data[i] < threshold ? 0 : 255;
  }
}

function edgeParams(edge: EdgeTighten) {
  if (edge === "tight") {
    return {
      softDrop: 130,
      hardenAt: 190,
      erodeRadius: 5,
      lightPeel: 115,
      spurPasses: 10,
    };
  }
  return {
    softDrop: 72,
    hardenAt: 120,
    erodeRadius: 2,
    lightPeel: 145,
    spurPasses: 3,
  };
}

/**
 * Shared post-cutout cleanup for logos (chroma or AI).
 * Makes Normal vs Tighter visibly different and kills thin exterior residue arcs.
 */
export function cleanupCutoutEdges(
  canvas: HTMLCanvasElement,
  edge: EdgeTighten = "normal",
  bg: Rgb | null = null,
  hooks?: { onResidue?: (removed: number) => void },
): HTMLCanvasElement {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D indisponible.");
  const w = canvas.width;
  const h = canvas.height;
  const image = ctx.getImageData(0, 0, w, h);
  const { data } = image;
  const p = edgeParams(edge);

  // Soft AI mattes → binary, then peel light fringe / spurs
  hardenMatte(data, p.hardenAt);
  peelLightFringeFromDarkSubjects(data, w, h, bg, { lightThreshold: p.lightPeel });
  cleanWashedFringe(data, w, h, bg ?? ([0, 0, 0] as Rgb));
  dropSmallIslands(data, w, h);
  erodeThinSpurs(data, w, h, p.spurPasses);
  erodeAlpha(data, w, h, p.erodeRadius);
  recolorEdgesFromInterior(data, w, h);
  peelLightFringeFromDarkSubjects(data, w, h, bg, { lightThreshold: p.lightPeel });
  erodeThinSpurs(data, w, h, Math.max(2, (p.spurPasses / 2) | 0));
  dropSmallIslands(data, w, h);
  hardenMatte(data, p.hardenAt);

  const mid = document.createElement("canvas");
  mid.width = w;
  mid.height = h;
  const midCtx = mid.getContext("2d");
  if (!midCtx) throw new Error("Canvas 2D indisponible.");
  midCtx.putImageData(image, 0, 0);

  // Detect leftover edge colors that don't match the subject core (white crumbs)
  const scrubbed = scrubMismatchedEdgeColors(mid, {
    maxPasses: edge === "tight" ? 10 : 5,
  });
  if (scrubbed.removed > 0) {
    hooks?.onResidue?.(scrubbed.removed);
    if (scrubbed.canvas !== mid) {
      mid.width = 0;
      mid.height = 0;
    }
    return scrubbed.canvas;
  }
  return mid;
}

/**
 * Contour scope:
 * - exterior: only remove background connected to the image edges; keep eyes / interior details
 * - interior: allow interior holes (AI default; chroma also keys enclosed bg pockets)
 */
export type CutScope = "exterior" | "interior";

/**
 * Dilate an opaque mask by `radius` (4-connected). Used to seal 1px cracks so
 * exterior flood doesn't leak into eyes / interior holes.
 */
function dilateMask(mask: Uint8Array, w: number, h: number, radius: number): Uint8Array {
  let cur = mask;
  for (let pass = 0; pass < radius; pass++) {
    const next = new Uint8Array(cur);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (cur[idx]) continue;
        let grow = false;
        if (x > 0 && cur[idx - 1]) grow = true;
        else if (x + 1 < w && cur[idx + 1]) grow = true;
        else if (y > 0 && cur[idx - w]) grow = true;
        else if (y + 1 < h && cur[idx + w]) grow = true;
        if (grow) next[idx] = 1;
      }
    }
    cur = next;
  }
  return cur;
}

/**
 * After a cutout, restore interior details from the original when scope is "exterior".
 * Must run AFTER edge cleanup — otherwise peel/scrub re-destroys white eyes.
 * Uses a scale-aware seal so upscaled ×2 cracks don't leak eyes into the exterior.
 */
export function applyCutScope(
  cutout: HTMLCanvasElement,
  original: HTMLCanvasElement,
  scope: CutScope,
): HTMLCanvasElement {
  if (scope === "interior") return cutout;
  if (cutout.width !== original.width || cutout.height !== original.height) {
    console.warn(
      "applyCutScope: size mismatch, skip interior restore",
      cutout.width,
      cutout.height,
      original.width,
      original.height,
    );
    return cutout;
  }

  const cCtx = cutout.getContext("2d", { willReadFrequently: true });
  const oCtx = original.getContext("2d", { willReadFrequently: true });
  if (!cCtx || !oCtx) throw new Error("Canvas 2D indisponible.");

  const w = cutout.width;
  const h = cutout.height;
  const cImg = cCtx.getImageData(0, 0, w, h);
  const oImg = oCtx.getImageData(0, 0, w, h);
  const c = cImg.data;
  const o = oImg.data;
  const ALPHA_TH = 28;
  const bg = sampleCorners(o, w, h);

  // Opaque mask from cutout, sealed wide enough for ×2 upscale slits
  const opaque = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    if (c[i * 4 + 3] >= ALPHA_TH) opaque[i] = 1;
  }
  const sealRadius = Math.max(5, Math.round(Math.min(w, h) / 48));
  const sealed = dilateMask(opaque, w, h, sealRadius);

  const exterior = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let qh = 0;
  let qt = 0;

  const enq = (x: number, y: number) => {
    const idx = y * w + x;
    if (exterior[idx]) return;
    if (sealed[idx]) return;
    exterior[idx] = 1;
    queue[qt++] = idx;
  };

  for (let x = 0; x < w; x++) {
    enq(x, 0);
    enq(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    enq(0, y);
    enq(w - 1, y);
  }
  while (qh < qt) {
    const idx = queue[qh++];
    const x = idx % w;
    const y = (idx / w) | 0;
    if (x > 0) enq(x - 1, y);
    if (x + 1 < w) enq(x + 1, y);
    if (y > 0) enq(x, y - 1);
    if (y + 1 < h) enq(x, y + 1);
  }

  for (let i = 0; i < w * h; i++) {
    const j = i * 4;
    if (exterior[i]) {
      c[j + 3] = 0;
      continue;
    }

    const oA = o[j + 3];
    if (oA < 16) {
      // Nothing in original here — keep transparent
      c[j + 3] = 0;
      continue;
    }

    const oL = luma(o[j], o[j + 1], o[j + 2]);
    // Don't pull original background OR light fringe crumbs back into the matte
    const dBg = dist2(o[j], o[j + 1], o[j + 2], bg);
    const origIsDarkBg = dBg <= HARD_DIST + 10 && oL < 70;
    // Light AA / glow next to dark logos — treat as bg fringe, not subject
    const origIsLightFringe =
      oL > 130 && dBg <= SOFT_DIST + 40 && touchesTransparent(c, w, h, i % w, (i / w) | 0, 2);
    // Also: light pixels that were exterior-adjacent in the cutout (cleaned fringe zone)
    const cutWasClear = c[j + 3] < ALPHA_TH;
    const origIsEdgeCrumb = cutWasClear && oL > 110 && dBg <= SOFT_DIST + 60;

    if (origIsDarkBg || origIsLightFringe || origIsEdgeCrumb) {
      c[j + 3] = 0;
      continue;
    }

    // Interior of silhouette: restore subject pixels from original
    // (eyes, ear fills, gradients — whatever AI punched as holes)
    c[j] = o[j];
    c[j + 1] = o[j + 1];
    c[j + 2] = o[j + 2];
    c[j + 3] = 255;
  }

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const outCtx = out.getContext("2d");
  if (!outCtx) throw new Error("Canvas 2D indisponible.");
  outCtx.putImageData(cImg, 0, 0);
  return out;
}

/**
 * Detect silhouette-edge pixels whose color doesn't match the subject core
 * (classic leftover white/grey fringe the keyer missed) and scrub them.
 * Only runs on dark-dominant subjects so cream logos stay intact.
 */
export function scrubMismatchedEdgeColors(
  canvas: HTMLCanvasElement,
  opts: { maxPasses?: number } = {},
): { canvas: HTMLCanvasElement; removed: number } {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D indisponible.");
  const w = canvas.width;
  const h = canvas.height;
  const image = ctx.getImageData(0, 0, w, h);
  const { data } = image;
  const maxPasses = opts.maxPasses ?? 6;

  // Core luma = opaque pixels not on the transparent border
  let coreSum = 0;
  let coreN = 0;
  let opaqueN = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 200) continue;
      opaqueN += 1;
      if (touchesTransparent(data, w, h, x, y, 2)) continue;
      coreSum += luma(data[i], data[i + 1], data[i + 2]);
      coreN += 1;
    }
  }
  if (opaqueN < 32 || coreN < 16) {
    return { canvas, removed: 0 };
  }
  const coreMean = coreSum / coreN;
  // Bright subjects (cream cells, white icons): edge lights are the subject
  if (coreMean > 140) {
    return { canvas, removed: 0 };
  }

  // Edge residue = much lighter than the dark core (white chin crumbs, ear fringe)
  const residueDelta = Math.max(45, 110 - coreMean * 0.35);
  let removed = 0;

  for (let pass = 0; pass < maxPasses; pass++) {
    const snap = new Uint8ClampedArray(data);
    let passRemoved = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (snap[i + 3] < 16) continue;
        if (!touchesTransparent(snap, w, h, x, y, 1)) continue;

        const L = luma(snap[i], snap[i + 1], snap[i + 2]);
        if (L < coreMean + residueDelta) continue;

        // Confirm it's fringe, not an intentional bright detail on the rim:
        // most neighbors should be dark core or transparent (not a bright cluster)
        let darkN = 0;
        let brightN = 0;
        let clearN = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) {
              clearN += 1;
              continue;
            }
            const ni = (ny * w + nx) * 4;
            if (snap[ni + 3] < 16) {
              clearN += 1;
              continue;
            }
            const nL = luma(snap[ni], snap[ni + 1], snap[ni + 2]);
            if (nL < coreMean + residueDelta * 0.5) darkN += 1;
            else brightN += 1;
          }
        }
        if (clearN >= 2 && darkN >= 1 && brightN <= 6) {
          data[i + 3] = 0;
          passRemoved += 1;
        }
      }
    }
    removed += passRemoved;
    if (passRemoved === 0) break;
  }

  // Final pass: isolated white tip specks (ear points, 1–3 px crumbs).
  // These often fail the neighborhood test above when they sit alone on a tip.
  {
    const snap = new Uint8ClampedArray(data);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        if (snap[i + 3] < 16) continue;
        if (!touchesTransparent(snap, w, h, x, y, 1)) continue;

        const L = luma(snap[i], snap[i + 1], snap[i + 2]);
        // Must be clearly light vs dark logo core
        if (L < Math.max(150, coreMean + 70)) continue;

        let opaqueN = 0;
        let darkN = 0;
        let brightN = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = (ny * w + nx) * 4;
            if (snap[ni + 3] < 16) continue;
            opaqueN += 1;
            const nL = luma(snap[ni], snap[ni + 1], snap[ni + 2]);
            if (nL < 90) darkN += 1;
            else if (nL > 140) brightN += 1;
          }
        }

        // Lone tip speck, or light crumb almost only touching dark body
        const isolatedTip = opaqueN <= 3;
        const lightOnDarkRim = opaqueN <= 5 && darkN >= 2 && brightN === 0;
        if (isolatedTip || lightOnDarkRim) {
          data[i + 3] = 0;
          removed += 1;
        }
      }
    }
  }

  if (removed === 0) return { canvas, removed: 0 };

  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const outCtx = out.getContext("2d");
  if (!outCtx) throw new Error("Canvas 2D indisponible.");
  outCtx.putImageData(image, 0, 0);
  return { canvas: out, removed };
}

/**
 * Remove the solid background connected to the image edges.
 * Correct for logos / aplats (ex: fond noir d’un morpion) — unlike photo cutout.
 */
export type EdgeTighten = "normal" | "tight";

export type ChromaOptions = {
  /** How aggressively to crop fringe after keying. */
  edge?: EdgeTighten;
  /** exterior = keep enclosed details; interior = also key enclosed bg pockets */
  scope?: CutScope;
};

export function removeSolidBackground(
  canvas: HTMLCanvasElement,
  opts: ChromaOptions = {},
): HTMLCanvasElement {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D indisponible.");

  const edge: EdgeTighten = opts.edge ?? "normal";
  const scope: CutScope = opts.scope ?? "exterior";
  const p = edgeParams(edge);

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

  // Interior scope: punch only SMALL enclosed bg pockets (letter counters, rings).
  // Never globally key every bg-colored pixel — that eats near-black logo bodies.
  if (scope === "interior") {
    let remainingN = 0;
    for (let idx = 0; idx < visited.length; idx++) {
      if (!visited[idx]) remainingN += 1;
    }
    const seen = new Uint8Array(w * h);
    const q = new Int32Array(w * h);
    for (let start = 0; start < visited.length; start++) {
      if (visited[start] || seen[start]) continue;
      const si = start * 4;
      if (dist2(data[si], data[si + 1], data[si + 2], bg) > HARD_DIST) {
        seen[start] = 1;
        continue;
      }
      // Flood this bg-colored pocket
      let qh2 = 0;
      let qt2 = 0;
      q[qt2++] = start;
      seen[start] = 1;
      const pocket: number[] = [];
      while (qh2 < qt2) {
        const idx = q[qh2++];
        pocket.push(idx);
        const x = idx % w;
        const y = (idx / w) | 0;
        for (const [dx, dy] of [
          [-1, 0],
          [1, 0],
          [0, -1],
          [0, 1],
        ] as const) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const nidx = ny * w + nx;
          if (seen[nidx] || visited[nidx]) continue;
          const ni = nidx * 4;
          if (dist2(data[ni], data[ni + 1], data[ni + 2], bg) > HARD_DIST) continue;
          seen[nidx] = 1;
          q[qt2++] = nidx;
        }
      }
      // Keep large dark masses (the logo body); only clear small enclosed counters
      if (pocket.length > 0 && pocket.length < remainingN * 0.12) {
        for (const idx of pocket) visited[idx] = 1;
      }
    }
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
      const nextA = Math.round(data[i + 3] * factor * factor);
      data[i + 3] = nextA < p.softDrop ? 0 : nextA;
    }
  }

  decontaminateEdges(data, w, h, bg);
  cleanDarkHalos(data, w, h);
  cleanWashedFringe(data, w, h, bg);
  peelLightFringeFromDarkSubjects(data, w, h, bg, { lightThreshold: p.lightPeel });
  decontaminateEdges(data, w, h, bg);
  cleanWashedFringe(data, w, h, bg);

  // Write keyed matte, then shared edge cleanup (erode / spur / islands)
  const keyed = document.createElement("canvas");
  keyed.width = w;
  keyed.height = h;
  const keyedCtx = keyed.getContext("2d");
  if (!keyedCtx) throw new Error("Canvas 2D indisponible.");
  keyedCtx.putImageData(image, 0, 0);
  return cleanupCutoutEdges(keyed, edge, bg);
}
