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
const dropzone = document.getElementById("dropzone") as HTMLElement;
const fileInput = document.getElementById("file-input") as HTMLInputElement;
const fileBrowse = document.getElementById("file-browse") as HTMLButtonElement | null;
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
const svgRecipesWrap = document.getElementById("svg-recipes-wrap") as HTMLElement;
const svgAdvancedWrap = document.getElementById("svg-advanced-wrap") as HTMLElement | null;
const svgPaletteLow = document.getElementById("svg-palette-low") as HTMLElement;
const svgPaletteHigh = document.getElementById("svg-palette-high") as HTMLElement;
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

const SVG_RECIPES: Record<
  string,
  { mode: SvgMode; detail: number; palette: number }
> = {
  logo: { mode: "logo", detail: 7, palette: 4 },
  "logo-flat": { mode: "logo", detail: 7, palette: 3 },
  "logo-sharp": { mode: "logo", detail: 9, palette: 4 },
  photo: { mode: "general", detail: 7, palette: 16 },
};

function applySvgRecipe(id: string, run = true) {
  const recipe = SVG_RECIPES[id];
  if (!recipe) return;
  toSvgToggle.checked = true;
  svgModeSelect.value = recipe.mode;
  svgDetailInput.value = String(recipe.detail);
  svgPaletteInput.value = String(recipe.palette);
  syncSvgUi();
  markActiveRecipe(id);
  if (run) scheduleLiveRun();
}

function markActiveRecipe(id: string | null) {
  document.querySelectorAll<HTMLButtonElement>("[data-svg-recipe]").forEach((btn) => {
    btn.classList.toggle("is-active", id !== null && btn.dataset.svgRecipe === id);
  });
}

function syncSvgUi() {
  const svgOn = toSvgToggle.checked;
  const mode = svgModeSelect.value as SvgMode;
  svgModeWrap.hidden = !svgOn;
  svgDetailWrap.hidden = !svgOn;
  svgPaletteWrap.hidden = !svgOn;
  svgHint.hidden = !svgOn;
  if (svgRecipesWrap) svgRecipesWrap.hidden = !svgOn;
  if (svgAdvancedWrap) svgAdvancedWrap.hidden = !svgOn;

  if (svgOn) {
    // Logo mode: palette max 4 (B&W / gray marks)
    if (mode === "logo") {
      svgPaletteInput.max = "4";
      if (Number(svgPaletteInput.value) > 4) svgPaletteInput.value = "3";
      if (svgPaletteHigh) svgPaletteHigh.textContent = t("step3.palette.high.logo");
    } else {
      const wasLogoCap = svgPaletteInput.max === "4";
      svgPaletteInput.max = "32";
      if (wasLogoCap && Number(svgPaletteInput.value) <= 4) {
        svgPaletteInput.value = "12";
      }
      if (svgPaletteHigh) svgPaletteHigh.textContent = t("step3.palette.high");
    }
    if (svgPaletteLow) svgPaletteLow.textContent = t("step3.palette.low");
    svgDetailValue.textContent = svgDetailInput.value;
    svgPaletteValue.textContent = svgPaletteInput.value;
    svgHint.textContent = t(mode === "logo" ? "step3.hint.logo" : "step3.hint.general");

    // Highlight matching recipe if sliders match a preset
    const match = Object.entries(SVG_RECIPES).find(
      ([, r]) =>
        r.mode === mode &&
        r.detail === Number(svgDetailInput.value) &&
        r.palette === Number(svgPaletteInput.value),
    );
    markActiveRecipe(match?.[0] ?? null);
  } else {
    markActiveRecipe(null);
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
  previewFrame?.classList.remove("is-svg");
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
  previewFrame?.classList.remove("is-svg");
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
  previewFrame?.classList.add("is-svg");
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
      previewFrame?.classList.remove("is-svg");
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
    companyMark.src = BRAND.baggero.logoSrc;
    companyMark.alt = BRAND.baggero.name;
    companyMark.onerror = () => {
      companyMark.onerror = null;
      companyMark.src = BRAND.baggero.markSrc;
    };
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

function maybePreloadModels() {
  const mode = bgModeSelect.value as BgMode;
  // Heavy rembg/ONNX only when Photo or Auto might need it
  if (mode === "ai" || mode === "auto") preloadModels();
}

function takeFile(file: File | null | undefined) {
  if (!file) return;
  if (!file.type.startsWith("image/") && !/\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name)) {
    setStatus(t("status.needImage"), true);
    return;
  }
  try {
    const dt = new DataTransfer();
    dt.items.add(file);
    fileInput.files = dt.files;
  } catch {
    // Some browsers block programmatic FileList assignment — session still gets the File.
  }
  assignSource(file);
  maybePreloadModels();
  scheduleLiveRun();
}

["dragenter", "dragover"].forEach((evt) => {
  dropzone.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add("is-drag");
  });
});

dropzone.addEventListener("dragleave", (e) => {
  e.preventDefault();
  const related = e.relatedTarget as Node | null;
  if (related && dropzone.contains(related)) return;
  dropzone.classList.remove("is-drag");
});

dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropzone.classList.remove("is-drag");
  takeFile(e.dataTransfer?.files?.[0]);
});

// Whole-window drop — users often miss the small dashed box
["dragenter", "dragover"].forEach((evt) => {
  document.addEventListener(evt, (e) => {
    if (!(e as DragEvent).dataTransfer?.types?.includes("Files")) return;
    e.preventDefault();
  });
});
document.addEventListener("drop", (e) => {
  const files = e.dataTransfer?.files;
  if (!files?.length) return;
  e.preventDefault();
  dropzone.classList.remove("is-drag");
  takeFile(files[0]);
});

function openFilePicker() {
  fileInput.click();
}

fileBrowse?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  openFilePicker();
});
dropzone.addEventListener("click", (e) => {
  if (e.target === fileBrowse) return;
  openFilePicker();
});
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    openFilePicker();
  }
});

fileInput.addEventListener("change", () => {
  takeFile(fileInput.files?.[0] ?? null);
});

upscaleSelect.addEventListener("change", scheduleLiveRun);
toSvgToggle.addEventListener("change", () => {
  if (toSvgToggle.checked) {
    // Always land on the usable Logo path — users were stuck on Photo/General.
    applySvgRecipe("logo");
    return;
  }
  syncSvgUi();
  scheduleLiveRun();
});
svgModeSelect.addEventListener("change", () => {
  syncSvgUi();
  scheduleLiveRun();
});
svgDetailInput.addEventListener("input", () => {
  svgDetailValue.textContent = svgDetailInput.value;
  markActiveRecipe(null);
  scheduleLiveRun();
});
svgPaletteInput.addEventListener("input", () => {
  svgPaletteValue.textContent = svgPaletteInput.value;
  markActiveRecipe(null);
  scheduleLiveRun();
});
document.querySelectorAll<HTMLButtonElement>("[data-svg-recipe]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const id = btn.dataset.svgRecipe;
    if (id) applySvgRecipe(id);
  });
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

