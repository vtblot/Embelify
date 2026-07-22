/**
 * Post-process ImageTracer SVG for Logo mode:
 * snap near-black / near-white fills to pure brand tones, and drop
 * zero-opacity hole-bucket paths ImageTracer emits for transparent pixels.
 */

function parseRgb(fill: string): { r: number; g: number; b: number } | null {
  const rgb = fill.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (rgb) {
    return { r: +rgb[1], g: +rgb[2], b: +rgb[3] };
  }
  const hex = fill.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!hex) return null;
  let h = hex[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function snapFillColor(fill: string): string {
  const trimmed = fill.trim();
  if (!trimmed || trimmed === "none" || trimmed === "transparent") return trimmed;
  const c = parseRgb(trimmed);
  if (!c) return fill;
  const L = luma(c.r, c.g, c.b);
  if (L <= 90) return "#000000";
  if (L >= 200) return "#ffffff";
  return fill;
}

function pathOpacity(tag: string): number {
  const m = tag.match(/\bopacity\s*=\s*["']([^"']+)["']/i);
  if (!m) return 1;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : 1;
}

/**
 * Rewrite fill attributes toward pure black & white; strip invisible hole paths.
 */
export function polishLogoSvg(svg: string): string {
  if (!svg || !svg.includes("<")) return svg;

  let out = svg.replace(/\bfill\s*=\s*(["'])([^"']*)\1/gi, (_m, q, value) => {
    return `fill=${q}${snapFillColor(value)}${q}`;
  });

  out = out.replace(/fill\s*:\s*([^;}]+)/gi, (_m, value) => {
    return `fill:${snapFillColor(String(value).trim())}`;
  });

  // Drop zero-opacity / none hole-bucket paths (transparent palette layer)
  out = out.replace(/<path\b[^>]*>/gi, (tag) => {
    if (/\bfill\s*=\s*["'](?:none|transparent)["']/i.test(tag)) return "";
    if (pathOpacity(tag) <= 0.01) return "";
    return tag;
  });

  return out;
}
