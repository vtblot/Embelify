export type UpscaleFactor = 1 | 2 | 4;

export type PipelineOptions = {
  upscale: UpscaleFactor;
  removeBg: boolean;
  toSvg: boolean;
  onProgress?: (message: string) => void;
};

export type PipelineResult =
  | { kind: "png"; blob: Blob }
  | { kind: "svg"; blob: Blob; svg: string };

const MAX_PIXELS = 16_000_000;

function progress(opts: PipelineOptions, message: string) {
  opts.onProgress?.(message);
}

async function loadImageBitmap(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file);
}

function loadHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Échec de chargement de l’image upscalée."));
    img.src = src;
  });
}

function bitmapToCanvas(bitmap: ImageBitmap): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D indisponible.");
  ctx.drawImage(bitmap, 0, 0);
  return canvas;
}

async function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error("Échec d’export PNG."));
      else resolve(blob);
    }, type);
  });
}

function lanczosUpscale(canvas: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(canvas.width * factor));
  out.height = Math.max(1, Math.round(canvas.height * factor));
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponible.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

async function upscaleCanvas(
  canvas: HTMLCanvasElement,
  factor: 2 | 4,
  opts: PipelineOptions,
): Promise<HTMLCanvasElement> {
  const outPixels = canvas.width * factor * canvas.height * factor;
  if (outPixels > MAX_PIXELS) {
    const scale = Math.sqrt(MAX_PIXELS / (canvas.width * canvas.height));
    progress(opts, `Image trop grande — upscale limité (×${scale.toFixed(2)})…`);
    return lanczosUpscale(canvas, scale);
  }

  progress(opts, `Upscale ×${factor} (modèle ESRGAN, premier chargement possible)…`);

  try {
    const [{ default: Upscaler }, modelMod] = await Promise.all([
      import("upscaler"),
      factor === 2
        ? import("@upscalerjs/esrgan-slim/2x")
        : import("@upscalerjs/esrgan-slim/4x"),
    ]);

    const model = "default" in modelMod ? modelMod.default : modelMod;
    const upscaler = new Upscaler({ model: model as never });
    try {
      const base64 = await upscaler.upscale(canvas, { output: "base64" });
      await upscaler.dispose();
      const src = base64.startsWith("data:")
        ? base64
        : `data:image/png;base64,${base64}`;
      const img = await loadHtmlImage(src);
      const out = document.createElement("canvas");
      out.width = img.naturalWidth;
      out.height = img.naturalHeight;
      const ctx = out.getContext("2d");
      if (!ctx) throw new Error("Canvas 2D indisponible.");
      ctx.drawImage(img, 0, 0);
      return out;
    } catch (err) {
      await upscaler.dispose().catch(() => undefined);
      throw err;
    }
  } catch (err) {
    console.warn("UpscalerJS indisponible, fallback canvas:", err);
    progress(opts, `Upscale ×${factor} (fallback navigateur)…`);
    return lanczosUpscale(canvas, factor);
  }
}

async function removeBackgroundFromCanvas(
  canvas: HTMLCanvasElement,
  opts: PipelineOptions,
): Promise<HTMLCanvasElement> {
  progress(opts, "Détourage du fond (modèle local, premier chargement possible)…");
  const { removeBackground } = await import("@imgly/background-removal");
  const inputBlob = await canvasToBlob(canvas);
  const cutout = await removeBackground(inputBlob, {
    output: { format: "image/png", quality: 1 },
  });
  const bitmap = await createImageBitmap(cutout);
  const out = bitmapToCanvas(bitmap);
  bitmap.close();
  return out;
}

async function canvasToSvg(canvas: HTMLCanvasElement, opts: PipelineOptions): Promise<string> {
  progress(opts, "Vectorisation SVG…");
  const ImageTracer = (await import("imagetracerjs")).default;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D indisponible.");
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  return new Promise((resolve, reject) => {
    try {
      const svg = ImageTracer.imagedataToSVG(imageData, {
        ltres: 1,
        qtres: 1,
        pathomit: 8,
        colorsampling: 2,
        numberofcolors: 32,
        strokewidth: 0,
        blurradius: 0,
        blurdelta: 20,
        scale: 1,
        viewbox: true,
      });
      resolve(svg);
    } catch (err) {
      reject(err);
    }
  });
}

/** In-memory pipeline. Nothing is uploaded or persisted. */
export async function runPipeline(
  file: File,
  opts: PipelineOptions,
): Promise<PipelineResult> {
  if (!opts.removeBg && !opts.toSvg && opts.upscale === 1) {
    throw new Error("Activez au moins une étape du pipeline.");
  }

  progress(opts, "Lecture de l’image…");
  let bitmap = await loadImageBitmap(file);
  let canvas = bitmapToCanvas(bitmap);
  bitmap.close();

  if (opts.upscale === 2 || opts.upscale === 4) {
    canvas = await upscaleCanvas(canvas, opts.upscale, opts);
  }

  if (opts.removeBg) {
    canvas = await removeBackgroundFromCanvas(canvas, opts);
  }

  if (opts.toSvg) {
    const svg = await canvasToSvg(canvas, opts);
    const blob = new Blob([svg], { type: "image/svg+xml" });
    progress(opts, "Terminé.");
    return { kind: "svg", blob, svg };
  }

  progress(opts, "Export PNG…");
  const blob = await canvasToBlob(canvas);
  progress(opts, "Terminé.");
  return { kind: "png", blob };
}
