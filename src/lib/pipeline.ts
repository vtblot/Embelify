import {
  applyCutScope,
  cleanupCutoutEdges,
  looksLikeFlatGraphic,
  removeSolidBackground,
  type CutScope,
  type EdgeTighten,
} from "./chroma";
import type { SvgWorkerRequest, SvgWorkerResponse } from "./svg.worker";

export type UpscaleFactor = 1 | 2 | 4;
/** auto: fond uni pour logos/aplats, IA pour photos */
export type BgMode = "auto" | "chroma" | "ai";
export type { CutScope, EdgeTighten };

export type PipelineStep = "source" | "upscale" | "background" | "svg" | "done";

export type PipelineOptions = {
  upscale: UpscaleFactor;
  removeBg: boolean;
  bgMode?: BgMode;
  /** Chroma / logo edge cleanup strength. */
  edgeTighten?: EdgeTighten;
  /** exterior = keep eyes/holes; interior = also clear enclosed bg */
  cutScope?: CutScope;
  toSvg: boolean;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
  /** Fired when a step begins (for loading labels). */
  onStepStart?: (step: PipelineStep) => void;
  /** Live preview after each completed step (canvas is ephemeral — copy/blob it). */
  onStep?: (step: PipelineStep, canvas: HTMLCanvasElement) => void | Promise<void>;
};

export type PipelineResult =
  | { kind: "png"; blob: Blob }
  | { kind: "svg"; blob: Blob; svg: string };

/** Soft cap — keeps WebGL / WASM memory under control. */
const MAX_INPUT_EDGE = 2048;
const MAX_OUTPUT_PIXELS = 12_000_000;

type UpscalerInstance = {
  upscale: (
    image: HTMLCanvasElement,
    options: {
      output: "tensor";
      patchSize?: number;
      padding?: number;
    },
  ) => Promise<unknown>;
  dispose: () => Promise<void>;
};

const upscalerCache = new Map<2 | 4, Promise<UpscalerInstance>>();
let rembgReady: Promise<void> | null = null;
let preferGpu = true;

function progress(opts: PipelineOptions, message: string) {
  opts.onProgress?.(message);
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException("Traitement annulé.", "AbortError");
}

function wipeCanvas(canvas: HTMLCanvasElement | null | undefined) {
  if (!canvas) return;
  canvas.width = 0;
  canvas.height = 0;
}

function cloneCanvas(source: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("Canvas 2D indisponible.");
  ctx.drawImage(source, 0, 0);
  return canvas;
}

function bitmapToCanvas(bitmap: ImageBitmap): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!ctx) throw new Error("Canvas 2D indisponible.");
  ctx.drawImage(bitmap, 0, 0);
  return canvas;
}

async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/png",
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) reject(new Error("Échec d’export."));
        else resolve(blob);
      },
      type,
      quality,
    );
  });
}

/** Downscale huge inputs before the heavy models run. */
async function normalizeInput(file: Blob, opts: PipelineOptions): Promise<HTMLCanvasElement> {
  progress(opts, "Lecture de l’image…");
  let bitmap = await createImageBitmap(file);
  const maxEdge = Math.max(bitmap.width, bitmap.height);

  if (maxEdge > MAX_INPUT_EDGE) {
    const scale = MAX_INPUT_EDGE / maxEdge;
    progress(
      opts,
      `Image large (${bitmap.width}×${bitmap.height}) — pré-réduction pour la perf…`,
    );
    const resized = await createImageBitmap(bitmap, {
      resizeWidth: Math.max(1, Math.round(bitmap.width * scale)),
      resizeHeight: Math.max(1, Math.round(bitmap.height * scale)),
      resizeQuality: "high",
    });
    bitmap.close();
    bitmap = resized;
  }

  const canvas = bitmapToCanvas(bitmap);
  bitmap.close();
  return canvas;
}

function lanczosUpscale(canvas: HTMLCanvasElement, factor: number): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(canvas.width * factor));
  out.height = Math.max(1, Math.round(canvas.height * factor));
  const ctx = out.getContext("2d", { alpha: true });
  if (!ctx) throw new Error("Canvas 2D indisponible.");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, out.width, out.height);
  return out;
}

async function getUpscaler(factor: 2 | 4): Promise<UpscalerInstance> {
  let pending = upscalerCache.get(factor);
  if (!pending) {
    pending = (async () => {
      const [{ default: Upscaler }, modelMod] = await Promise.all([
        import("upscaler"),
        factor === 2
          ? import("@upscalerjs/esrgan-slim/2x")
          : import("@upscalerjs/esrgan-slim/4x"),
      ]);
      const model = "default" in modelMod ? modelMod.default : modelMod;
      return new Upscaler({
        model: model as never,
      }) as unknown as UpscalerInstance;
    })();
    upscalerCache.set(factor, pending);
  }
  return pending;
}

async function tensorToCanvas(tensor: {
  shape: number[];
  dispose: () => void;
}): Promise<HTMLCanvasElement> {
  const tf = await import("@tensorflow/tfjs");
  const [height, width] = tensor.shape;
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  await tf.browser.toPixels(tensor as never, out);
  tensor.dispose();
  return out;
}

async function upscaleCanvas(
  canvas: HTMLCanvasElement,
  factor: 2 | 4,
  opts: PipelineOptions,
): Promise<HTMLCanvasElement> {
  throwIfAborted(opts.signal);
  const outPixels = canvas.width * factor * canvas.height * factor;
  if (outPixels > MAX_OUTPUT_PIXELS) {
    const scale = Math.sqrt(MAX_OUTPUT_PIXELS / (canvas.width * canvas.height));
    progress(opts, `Upscale limité (×${scale.toFixed(2)}) pour rester fluide…`);
    const out = lanczosUpscale(canvas, scale);
    wipeCanvas(canvas);
    return out;
  }

  progress(opts, `Upscale ×${factor}…`);
  try {
    const upscaler = await getUpscaler(factor);
    throwIfAborted(opts.signal);
    // patchSize keeps GPU memory bounded on larger images
    const patchSize = Math.max(canvas.width, canvas.height) > 512 ? 128 : undefined;
    const tensor = (await upscaler.upscale(canvas, {
      output: "tensor",
      ...(patchSize ? { patchSize, padding: 8 } : {}),
    })) as { shape: number[]; dispose: () => void };
    wipeCanvas(canvas);
    return await tensorToCanvas(tensor);
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    console.warn("UpscalerJS indisponible, fallback canvas:", err);
    progress(opts, `Upscale ×${factor} (fallback rapide)…`);
    const out = lanczosUpscale(canvas, factor);
    wipeCanvas(canvas);
    return out;
  }
}

function rembgConfig(device: "gpu" | "cpu") {
  return {
    // isnet_fp16 = "medium" quality / speed balance
    model: "isnet_fp16" as const,
    device,
    // Off-main-thread inference when the runtime allows it
    proxyToWorker: true,
    output: { format: "image/png" as const, quality: 0.92 },
  };
}

/** Warm models during idle time so the first run is faster. */
export function preloadModels(): void {
  if (rembgReady) return;
  rembgReady = (async () => {
    try {
      const { preload } = await import("@imgly/background-removal");
      const device: "gpu" | "cpu" =
        preferGpu && "gpu" in navigator ? "gpu" : "cpu";
      try {
        await preload(rembgConfig(device));
      } catch {
        preferGpu = false;
        await preload(rembgConfig("cpu"));
      }
    } catch (err) {
      console.warn("Préchargement rembg échoué:", err);
    }
  })();

  // Warm ×2 upscaler in parallel (most common)
  void getUpscaler(2).catch(() => undefined);
}

async function removeBackgroundAi(
  canvas: HTMLCanvasElement,
  opts: PipelineOptions,
): Promise<HTMLCanvasElement> {
  progress(opts, "Détourage IA (photos)…");
  const { removeBackground } = await import("@imgly/background-removal");
  // Capture before cutout — post-clean only for logos / explicit tight edges
  // (hair / soft photo mattes must not be hardened).
  const logoLike = looksLikeFlatGraphic(canvas);
  const edge: EdgeTighten = opts.edgeTighten ?? "normal";
  const scope: CutScope = opts.cutScope ?? "exterior";
  // Keep original pixels to restore white eyes / interior details
  const original = cloneCanvas(canvas);

  const run = async (device: "gpu" | "cpu") => {
    const inputBlob = await canvasToBlob(canvas, "image/png");
    throwIfAborted(opts.signal);
    return removeBackground(inputBlob, {
      ...rembgConfig(device),
      progress: (key, current, total) => {
        if (key.startsWith("fetch:") || key.startsWith("compute:")) {
          progress(opts, `Détourage IA (${key} ${current}/${total})…`);
        }
      },
    });
  };

  let cutout: Blob;
  try {
    cutout = await run(preferGpu ? "gpu" : "cpu");
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    if (preferGpu) {
      preferGpu = false;
      progress(opts, "GPU indisponible — bascule CPU…");
      cutout = await run("cpu");
    } else {
      wipeCanvas(original);
      throw err;
    }
  }

  wipeCanvas(canvas);
  const bitmap = await createImageBitmap(cutout);
  let raw = bitmapToCanvas(bitmap);
  bitmap.close();

  // Edge cleanup FIRST (peel/scrub). Exterior restore MUST be last —
  // otherwise Tighter peel re-deletes restored white eyes / ear fills.
  if (logoLike || edge === "tight") {
    const cleaned = cleanupCutoutEdges(raw, edge, null, {
      onResidue: (n) =>
        progress(
          opts,
          `Résidu de contour détecté (${n} px) — nettoyage des couleurs hors sujet…`,
        ),
    });
    wipeCanvas(raw);
    raw = cleaned;
  }

  if (scope === "exterior") {
    progress(opts, "Contours extérieurs — restauration des détails intérieurs…");
    const restored = applyCutScope(raw, original, "exterior");
    wipeCanvas(raw);
    raw = restored;
  }
  wipeCanvas(original);
  return raw;
}

async function removeBackgroundFromCanvas(
  canvas: HTMLCanvasElement,
  opts: PipelineOptions,
): Promise<HTMLCanvasElement> {
  throwIfAborted(opts.signal);
  const mode: BgMode = opts.bgMode ?? "auto";

  let useChroma = mode === "chroma";
  if (mode === "auto") {
    useChroma = looksLikeFlatGraphic(canvas);
    progress(
      opts,
      useChroma
        ? "Fond uni détecté — détourage par couleur (logos / aplats)…"
        : "Photo détectée — détourage IA…",
    );
  }

  if (useChroma) {
    progress(opts, "Suppression du fond uni (flood-fill depuis les bords)…");
    const out = removeSolidBackground(canvas, {
      edge: opts.edgeTighten ?? "normal",
      scope: opts.cutScope ?? "exterior",
    });
    wipeCanvas(canvas);
    return out;
  }

  return removeBackgroundAi(canvas, opts);
}

function rasterToSvgInWorker(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      reject(new Error("Canvas 2D indisponible."));
      return;
    }
    const { width, height } = canvas;
    const imageData = ctx.getImageData(0, 0, width, height);
    const buffer = imageData.data.buffer.slice(0);

    const worker = new Worker(new URL("./svg.worker.ts", import.meta.url), {
      type: "module",
    });

    const timer = window.setTimeout(() => {
      worker.terminate();
      reject(new Error("Vectorisation trop longue."));
    }, 60_000);

    worker.onmessage = (event: MessageEvent<SvgWorkerResponse>) => {
      window.clearTimeout(timer);
      worker.terminate();
      if (event.data.ok) resolve(event.data.svg);
      else reject(new Error(event.data.error));
    };
    worker.onerror = (event) => {
      window.clearTimeout(timer);
      worker.terminate();
      reject(event.error ?? new Error("Erreur worker SVG."));
    };

    const payload: SvgWorkerRequest = { width, height, buffer };
    worker.postMessage(payload, [buffer]);
  });
}

async function canvasToSvg(canvas: HTMLCanvasElement, opts: PipelineOptions): Promise<string> {
  throwIfAborted(opts.signal);
  progress(opts, "Vectorisation SVG (worker)…");
  try {
    return await rasterToSvgInWorker(canvas);
  } catch (err) {
    console.warn("Worker SVG indisponible, fallback main thread:", err);
    const ImageTracer = (await import("imagetracerjs")).default;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D indisponible.");
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return ImageTracer.imagedataToSVG(imageData, {
      ltres: 1,
      qtres: 1,
      pathomit: 8,
      colorsampling: 2,
      numberofcolors: 24,
      strokewidth: 0,
      viewbox: true,
    });
  }
}

/** Dispose cached upscalers (call when wiping the tab session). */
export async function disposePipelineResources(): Promise<void> {
  const entries = [...upscalerCache.entries()];
  upscalerCache.clear();
  await Promise.all(
    entries.map(async ([, promise]) => {
      try {
        const u = await promise;
        await u.dispose();
      } catch {
        /* ignore */
      }
    }),
  );
  try {
    const tf = await import("@tensorflow/tfjs");
    tf.engine().startScope();
    tf.engine().endScope();
    await tf.disposeVariables();
  } catch {
    /* ignore */
  }
}

function emitStepStart(opts: PipelineOptions, step: PipelineStep) {
  opts.onStepStart?.(step);
}

async function emitStep(
  opts: PipelineOptions,
  step: PipelineStep,
  canvas: HTMLCanvasElement,
) {
  if (!opts.onStep) return;
  await opts.onStep(step, canvas);
}

/** In-memory pipeline. Nothing is uploaded or persisted. */
export async function runPipeline(
  file: File,
  opts: PipelineOptions,
): Promise<PipelineResult> {
  if (!opts.removeBg && !opts.toSvg && opts.upscale === 1) {
    throw new Error("Activez au moins une étape du pipeline.");
  }

  emitStepStart(opts, "source");
  let canvas = await normalizeInput(file, opts);
  throwIfAborted(opts.signal);
  await emitStep(opts, "source", canvas);

  try {
    if (opts.upscale === 2 || opts.upscale === 4) {
      emitStepStart(opts, "upscale");
      canvas = await upscaleCanvas(canvas, opts.upscale, opts);
      throwIfAborted(opts.signal);
      await emitStep(opts, "upscale", canvas);
    }

    if (opts.removeBg) {
      emitStepStart(opts, "background");
      canvas = await removeBackgroundFromCanvas(canvas, opts);
      throwIfAborted(opts.signal);
      await emitStep(opts, "background", canvas);
    }

    if (opts.toSvg) {
      emitStepStart(opts, "svg");
      const svg = await canvasToSvg(canvas, opts);
      const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
      wipeCanvas(canvas);
      progress(opts, "Terminé.");
      return { kind: "svg", blob, svg };
    }

    emitStepStart(opts, "done");
    progress(opts, "Export PNG…");
    await emitStep(opts, "done", canvas);
    const hasAlpha = opts.removeBg;
    const blob = hasAlpha
      ? await canvasToBlob(canvas, "image/png")
      : await canvasToBlob(canvas, "image/webp", 0.92).catch(() =>
          canvasToBlob(canvas, "image/png"),
        );
    wipeCanvas(canvas);
    progress(opts, "Terminé.");
    return { kind: "png", blob };
  } catch (err) {
    wipeCanvas(canvas);
    throw err;
  }
}
