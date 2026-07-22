import { BRAND } from "./brand";
import {
  applyStaticI18n,
  detectLocale,
  getLocale,
  setLocale,
  t,
  type Locale,
} from "./i18n";
import {
  disposePipelineResources,
  preloadModels,
  runPipeline,
  type BgMode,
  type CutScope,
  type EdgeTighten,
  type PipelineStep,
  type SvgMode,
  type UpscaleFactor,
} from "./lib/pipeline";
import {
  beginWork,
  downloadResult,
  getSourceFile,
  installSessionGuards,
  setResult,
  setSourceFile,
  wipeSession,
} from "./lib/session";

const form = document.getElementById("pipeline-form") as HTMLFormElement;
const dropzone = document.getElementById("dropzone") as HTMLLabelElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const fileName = document.getElementById("file-name") as HTMLSpanElement;
const submitBtn = document.getElementById("submit-btn") as HTMLButtonElement;
const statusEl = document.getElementById("status") as HTMLParagraphElement;
const preview = document.getElementById("preview") as HTMLElement;
const previewFrame = preview.querySelector(".preview-frame") as HTMLElement;
const previewImg = document.getElementById("preview-img") as HTMLImageElement;
const previewSvg = document.getElementById("preview-svg") as HTMLDivElement;
const previewSpinner = document.getElementById("preview-spinner") as HTMLElement;
const previewLabel = document.getElementById("preview-label") as HTMLParagraphElement;
const stepBadge = document.getElementById("step-badge") as HTMLParagraphElement;
const downloadBtn = document.getElementById("download-btn") as HTMLButtonElement;
const clearBtn = document.getElementById("clear-btn") as HTMLButtonElement;
const removeBgToggle = document.getElementById("remove_bg") as HTMLInputElement;
const bgModeSelect = document.getElementById("bg_mode") as HTMLSelectElement;
const bgModeWrap = document.getElementById("bg-mode-wrap") as HTMLElement;
const edgeTightenSelect = document.getElementById("edge_tighten") as HTMLSelectElement;
const edgeTightenWrap = document.getElementById("edge-tighten-wrap") as HTMLElement;
const cutScopeSelect = document.getElementById("cut_scope") as HTMLSelectElement;
const cutScopeWrap = document.getElementById("cut-scope-wrap") as HTMLElement;
const bgHint = document.getElementById("bg-hint") as HTMLParagraphElement;
const upscaleSelect = document.getElementById("upscale") as HTMLSelectElement;
const toSvgToggle = document.getElementById("to_svg") as HTMLInputElement;
const svgModeSelect = document.getElementById("svg_mode") as HTMLSelectElement;
const svgModeWrap = document.getElementById("svg-mode-wrap") as HTMLElement;
const svgDetailInput = document.getElementById("svg_detail") as HTMLInputElement;
const svgDetailWrap = document.getElementById("svg-detail-wrap") as HTMLElement;
const svgDetailValue = document.getElementById("svg-detail-value") as HTMLElement;
const svgPaletteInput = document.getElementById("svg_palette") as HTMLInputElement;
const svgPaletteWrap = document.getElementById("svg-palette-wrap") as HTMLElement;
const svgPaletteValue = document.getElementById("svg-palette-value") as HTMLElement;
const svgHint = document.getElementById("svg-hint") as HTMLParagraphElement;
const langSelect = document.getElementById("lang-select") as HTMLSelectElement;
const sisterLink = document.getElementById("sister-link") as HTMLAnchorElement;

let debounceTimer: number | null = null;
let runGeneration = 0;

const STEP_LOADING_KEY: Record<PipelineStep, Parameters<typeof t>[0]> = {
  source: "badge.source.loading",
  upscale: "badge.upscale.loading",
  background: "badge.background.loading",
  svg: "badge.svg.loading",
  done: "badge.done.loading",
};

const STEP_READY_KEY: Record<PipelineStep, Parameters<typeof t>[0]> = {
  source: "badge.source.ready",
  upscale: "badge.upscale.ready",
  background: "badge.background.ready",
  svg: "badge.svg.ready",
  done: "badge.done.ready",
};

const BG_HINT_KEY: Record<BgMode, Parameters<typeof t>[0]> = {
  chroma: "step2.hint.chroma",
  auto: "step2.hint.auto",
  ai: "step2.hint.ai",
};

function syncBgUi() {
  const rembgOn = removeBgToggle.checked;
  bgModeWrap.hidden = !rembgOn;
  edgeTightenWrap.hidden = !rembgOn;
  cutScopeWrap.hidden = !rembgOn;
  bgHint.hidden = !rembgOn;
  if (rembgOn) {
    bgHint.textContent = t(BG_HINT_KEY[bgModeSelect.value as BgMode] ?? "step2.hint.chroma");
  }
}

function syncSvgUi() {
  const svgOn = toSvgToggle.checked;
  const mode = svgModeSelect.value as SvgMode;
  svgModeWrap.hidden = !svgOn;
  svgDetailWrap.hidden = !svgOn;
  svgPaletteWrap.hidden = !svgOn;
  svgHint.hidden = !svgOn;

  if (svgOn) {
    // Logo mode: palette max 4 (B&W / gray marks)
    if (mode === "logo") {
      svgPaletteInput.max = "4";
      if (Number(svgPaletteInput.value) > 4) svgPaletteInput.value = "3";
    } else {
      const wasLogoCap = svgPaletteInput.max === "4";
      svgPaletteInput.max = "32";
      if (wasLogoCap && Number(svgPaletteInput.value) <= 4) {
        svgPaletteInput.value = "12";
      }
    }
    svgDetailValue.textContent = svgDetailInput.value;
    svgPaletteValue.textContent = svgPaletteInput.value;
    svgHint.textContent = t(mode === "logo" ? "step3.hint.logo" : "step3.hint.general");
  }
}

function setStatus(message: string, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
}

function setPreviewBusy(busy: boolean) {
  previewFrame?.classList.toggle("is-busy", busy);
  if (previewSpinner) previewSpinner.hidden = !busy;
}

function yieldToPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function setBadge(text: string, state: "loading" | "ready", generation: number) {
  if (generation !== runGeneration) return;
  preview.hidden = false;
  stepBadge.hidden = false;
  stepBadge.textContent = text;
  stepBadge.classList.toggle("is-loading", state === "loading");
  stepBadge.classList.toggle("is-ready", state === "ready");
  setPreviewBusy(state === "loading");
  previewLabel.textContent =
    state === "loading" ? t("preview.processing") : t("preview.synced");
}

function showFileName(file: File | null) {
  if (!file) {
    fileName.hidden = true;
    fileName.textContent = "";
    return;
  }
  fileName.hidden = false;
  fileName.textContent = file.name;
}

function resetPreviewUi() {
  preview.hidden = true;
  previewImg.hidden = true;
  previewImg.removeAttribute("src");
  previewSvg.hidden = true;
  previewSvg.innerHTML = "";
  stepBadge.hidden = true;
  stepBadge.classList.remove("is-loading", "is-ready");
  downloadBtn.disabled = true;
  previewFrame?.style.removeProperty("--preview-ar");
  setPreviewBusy(false);
}

function clearUiAssets() {
  resetPreviewUi();
  fileInput.value = "";
  showFileName(null);
}

function assignSource(file: File | null) {
  setSourceFile(file);
  showFileName(file);
}

function setPreviewAspect(width: number, height: number) {
  if (!previewFrame || width < 1 || height < 1) return;
  previewFrame.style.setProperty("--preview-ar", `${width} / ${height}`);
}

async function waitForImgPaint(url: string): Promise<void> {
  previewImg.src = url;
  previewImg.hidden = false;
  if (previewImg.decode) {
    try {
      await previewImg.decode();
    } catch {
      /* ignore */
    }
  } else {
    await new Promise<void>((resolve) => {
      if (previewImg.complete) {
        resolve();
        return;
      }
      previewImg.onload = () => resolve();
      previewImg.onerror = () => resolve();
    });
  }
  if (previewImg.naturalWidth > 0 && previewImg.naturalHeight > 0) {
    setPreviewAspect(previewImg.naturalWidth, previewImg.naturalHeight);
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

async function showCanvasPreview(
  canvas: HTMLCanvasElement,
  step: PipelineStep,
  generation: number,
) {
  if (generation !== runGeneration) return;

  setPreviewAspect(canvas.width, canvas.height);

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("preview"))), "image/png");
  });
  if (generation !== runGeneration) return;

  const { previewUrl } = setResult({
    kind: "png",
    blob,
    filename: "embelify.png",
  });
  previewSvg.hidden = true;
  previewSvg.innerHTML = "";
  preview.hidden = false;
  downloadBtn.disabled = true;

  await waitForImgPaint(previewUrl);
  if (generation !== runGeneration) return;

  setBadge(t(STEP_READY_KEY[step]), "ready", generation);
}

function showSvgPreview(svg: string, generation: number) {
  if (generation !== runGeneration) return;
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  setResult({ kind: "svg", blob, svg, filename: "embelify.svg" });
  previewImg.hidden = true;
  previewImg.removeAttribute("src");
  previewSvg.innerHTML = svg;
  previewSvg.hidden = false;
  preview.hidden = false;
  downloadBtn.disabled = false;

  const vb = svg.match(/viewBox=["']\s*([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)\s*["']/i);
  if (vb) {
    const w = Number(vb[3]);
    const h = Number(vb[4]);
    if (w > 0 && h > 0) setPreviewAspect(w, h);
  }

  setBadge(t(STEP_READY_KEY.svg), "ready", generation);
  previewLabel.textContent = t("preview.svgReady");
}

function readOptions() {
  return {
    upscale: Number(upscaleSelect.value) as UpscaleFactor,
    removeBg: removeBgToggle.checked,
    bgMode: bgModeSelect.value as BgMode,
    edgeTighten: edgeTightenSelect.value as EdgeTighten,
    cutScope: cutScopeSelect.value as CutScope,
    toSvg: toSvgToggle.checked,
    svgMode: svgModeSelect.value as SvgMode,
    svgDetail: Number(svgDetailInput.value),
    svgPalette: Number(svgPaletteInput.value),
  };
}

async function runLive(reason: "auto" | "manual" = "auto") {
  const file = getSourceFile() ?? fileInput.files?.[0] ?? null;
  if (!file) {
    if (reason === "manual") setStatus(t("status.choose"), true);
    return;
  }
  assignSource(file);

  const opts = readOptions();
  if (opts.upscale === 1 && !opts.removeBg && !opts.toSvg) {
    setStatus(t("status.needOption"), true);
    resetPreviewUi();
    return;
  }

  const myGen = ++runGeneration;
  const signal = beginWork();
  submitBtn.disabled = true;
  downloadBtn.disabled = true;
  preview.hidden = false;
  setBadge(t("badge.prep"), "loading", myGen);
  setStatus(reason === "auto" ? t("status.updating") : t("status.processing"));
  // Let the spinner paint before heavy sync work (flatten / ImageTracer)
  await yieldToPaint();
  if (myGen !== runGeneration) return;

  try {
    const result = await runPipeline(file, {
      ...opts,
      signal,
      onProgress: (msg) => {
        // Technical progress from pipeline stays in current language when possible;
        // keep raw message as fallback for model download progress.
        if (myGen === runGeneration) setStatus(msg);
      },
      onStepStart: (step) => {
        if (myGen !== runGeneration) return;
        const label = t(STEP_LOADING_KEY[step]);
        setBadge(label, "loading", myGen);
        setStatus(label);
      },
      onStep: async (step, canvas) => {
        if (myGen !== runGeneration) return;
        await showCanvasPreview(canvas, step, myGen);
      },
    });

    if (myGen !== runGeneration) return;

    if (result.kind === "svg") {
      showSvgPreview(result.svg, myGen);
    } else {
      const filename =
        result.blob.type === "image/webp" ? "embelify.webp" : "embelify.png";
      const { previewUrl } = setResult({
        kind: "png",
        blob: result.blob,
        filename,
      });
      previewSvg.hidden = true;
      previewSvg.innerHTML = "";
      preview.hidden = false;
      await waitForImgPaint(previewUrl);
      if (myGen !== runGeneration) return;
      downloadBtn.disabled = false;
      setBadge(t(STEP_READY_KEY.done), "ready", myGen);
      const nw = previewImg.naturalWidth;
      const nh = previewImg.naturalHeight;
      const sizeNote = nw > 0 && nh > 0 ? ` · ${nw}×${nh}` : "";
      previewLabel.textContent =
        (opts.removeBg ? t("preview.pngReady") : t("preview.resultReady")) + sizeNote;
    }

    downloadBtn.disabled = false;
    setStatus(t("status.ready"));
  } catch (err) {
    if (myGen !== runGeneration) return;
    if (err instanceof DOMException && err.name === "AbortError") {
      setStatus(t("status.aborted"));
    } else {
      const message = err instanceof Error ? err.message : t("status.fail");
      setStatus(message, true);
      setBadge(t("badge.error"), "ready", myGen);
    }
  } finally {
    if (myGen === runGeneration) {
      submitBtn.disabled = false;
      setPreviewBusy(false);
    }
  }
}

function scheduleLiveRun() {
  if (!getSourceFile() && !fileInput.files?.[0]) return;
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  if (runGeneration > 0 || getSourceFile() || fileInput.files?.[0]) {
    preview.hidden = false;
    stepBadge.hidden = false;
    stepBadge.textContent = t("badge.changed");
    stepBadge.classList.add("is-loading");
    stepBadge.classList.remove("is-ready");
    previewLabel.textContent = t("preview.waiting");
    setPreviewBusy(true);
    setStatus(t("status.optionChanged"));
  }
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    void runLive("auto");
  }, 280);
}

function refreshI18n() {
  applyStaticI18n();
  syncBgUi();
  syncSvgUi();
  langSelect.value = getLocale();
  if (sisterLink) {
    sisterLink.href = BRAND.spektrografy.url;
    sisterLink.textContent = BRAND.spektrografy.name;
  }
  const companyMark = document.getElementById("company-mark") as HTMLImageElement | null;
  if (companyMark) {
    companyMark.src = BRAND.baggero.markSrc;
    companyMark.alt = BRAND.baggero.name;
  }
  // If idle with default status, refresh it
  if (!getSourceFile() && !fileInput.files?.[0] && !statusEl.classList.contains("is-error")) {
    setStatus(t("status.drop"));
  }
}

removeBgToggle.addEventListener("change", () => {
  syncBgUi();
  scheduleLiveRun();
});
bgModeSelect.addEventListener("change", () => {
  syncBgUi();
  maybePreloadModels();
  scheduleLiveRun();
});
edgeTightenSelect.addEventListener("change", scheduleLiveRun);
cutScopeSelect.addEventListener("change", scheduleLiveRun);

["dragenter", "dragover"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.add("is-drag");
  });
});

["dragleave", "drop"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    dropzone.classList.remove("is-drag");
  });
});

function maybePreloadModels() {
  const mode = bgModeSelect.value as BgMode;
  // Heavy rembg/ONNX only when Photo or Auto might need it
  if (mode === "ai" || mode === "auto") preloadModels();
}

dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
  assignSource(file);
  maybePreloadModels();
  scheduleLiveRun();
});

fileInput.addEventListener("change", () => {
  assignSource(fileInput.files?.[0] ?? null);
  if (fileInput.files?.[0]) {
    maybePreloadModels();
    scheduleLiveRun();
  }
});

upscaleSelect.addEventListener("change", scheduleLiveRun);
toSvgToggle.addEventListener("change", () => {
  syncSvgUi();
  scheduleLiveRun();
});
svgModeSelect.addEventListener("change", () => {
  syncSvgUi();
  scheduleLiveRun();
});
svgDetailInput.addEventListener("input", () => {
  svgDetailValue.textContent = svgDetailInput.value;
  scheduleLiveRun();
});
svgPaletteInput.addEventListener("input", () => {
  svgPaletteValue.textContent = svgPaletteInput.value;
  scheduleLiveRun();
});

downloadBtn.addEventListener("click", () => {
  if (!downloadResult()) {
    setStatus(t("status.noResult"), true);
    return;
  }
  setStatus(t("status.downloaded"));
});

clearBtn.addEventListener("click", async () => {
  runGeneration += 1;
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  wipeSession();
  clearUiAssets();
  await disposePipelineResources();
  setStatus(t("status.cleared"));
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  void runLive("manual");
});

langSelect.addEventListener("change", () => {
  setLocale(langSelect.value as Locale);
  refreshI18n();
});

installSessionGuards(() => {
  runGeneration += 1;
  clearUiAssets();
  void disposePipelineResources();
});

setLocale(detectLocale());
refreshI18n();
// Do not preload rembg/ONNX on idle — wait until Auto/Photo is relevant
maybePreloadModels();

