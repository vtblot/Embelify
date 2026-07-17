import "./styles.css";
import {
  disposePipelineResources,
  preloadModels,
  runPipeline,
  type BgMode,
  type PipelineStep,
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
const previewImg = document.getElementById("preview-img") as HTMLImageElement;
const previewSvg = document.getElementById("preview-svg") as HTMLDivElement;
const previewLabel = document.getElementById("preview-label") as HTMLParagraphElement;
const stepBadge = document.getElementById("step-badge") as HTMLParagraphElement;
const downloadBtn = document.getElementById("download-btn") as HTMLButtonElement;
const clearBtn = document.getElementById("clear-btn") as HTMLButtonElement;
const removeBgToggle = document.getElementById("remove_bg") as HTMLInputElement;
const bgModeSelect = document.getElementById("bg_mode") as HTMLSelectElement;
const bgModeWrap = document.getElementById("bg-mode-wrap") as HTMLElement;
const bgHint = document.getElementById("bg-hint") as HTMLParagraphElement;
const upscaleSelect = document.getElementById("upscale") as HTMLSelectElement;
const toSvgToggle = document.getElementById("to_svg") as HTMLInputElement;

let debounceTimer: number | null = null;
let runGeneration = 0;

const STEP_LABELS: Record<PipelineStep, string> = {
  source: "Image source",
  upscale: "Après upscale",
  background: "Après fond transparent",
  svg: "Après SVG",
  done: "Résultat",
};

const BG_HINTS: Record<BgMode, string> = {
  chroma: "Idéal pour logos / aplats : enlève une couleur de fond (souvent le noir).",
  auto: "Choisit tout seul : fond uni pour un logo, découpe sujet pour une photo.",
  ai: "Pour les photos : isole une personne ou un objet. Pas adapté aux logos plats.",
};

function syncBgUi() {
  bgModeWrap.hidden = !removeBgToggle.checked;
  bgHint.hidden = !removeBgToggle.checked;
  if (removeBgToggle.checked) {
    bgHint.textContent = BG_HINTS[bgModeSelect.value as BgMode] ?? BG_HINTS.chroma;
  }
}
removeBgToggle.addEventListener("change", () => {
  syncBgUi();
  scheduleLiveRun();
});
bgModeSelect.addEventListener("change", () => {
  syncBgUi();
  scheduleLiveRun();
});
syncBgUi();

function setStatus(message: string, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
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
  downloadBtn.disabled = true;
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

async function showCanvasPreview(canvas: HTMLCanvasElement, step: PipelineStep) {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("preview"))), "image/png");
  });
  const { previewUrl } = setResult({
    kind: "png",
    blob,
    filename: "embelify.png",
  });
  previewSvg.hidden = true;
  previewSvg.innerHTML = "";
  previewImg.src = previewUrl;
  previewImg.hidden = false;
  preview.hidden = false;
  downloadBtn.disabled = false;
  stepBadge.hidden = false;
  stepBadge.textContent = STEP_LABELS[step];
  previewLabel.textContent = "Aperçu live";
}

function showSvgPreview(svg: string) {
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  setResult({ kind: "svg", blob, svg, filename: "embelify.svg" });
  previewImg.hidden = true;
  previewImg.removeAttribute("src");
  previewSvg.innerHTML = svg;
  previewSvg.hidden = false;
  preview.hidden = false;
  downloadBtn.disabled = false;
  stepBadge.hidden = false;
  stepBadge.textContent = STEP_LABELS.svg;
  previewLabel.textContent = "Aperçu SVG";
}

function readOptions() {
  return {
    upscale: Number(upscaleSelect.value) as UpscaleFactor,
    removeBg: removeBgToggle.checked,
    bgMode: bgModeSelect.value as BgMode,
    toSvg: toSvgToggle.checked,
  };
}

async function runLive(reason: "auto" | "manual" = "auto") {
  const file = getSourceFile() ?? fileInput.files?.[0] ?? null;
  if (!file) {
    if (reason === "manual") setStatus("Choisissez une image.", true);
    return;
  }
  assignSource(file);

  const opts = readOptions();
  if (opts.upscale === 1 && !opts.removeBg && !opts.toSvg) {
    setStatus("Activez au moins une option pour voir un résultat.", true);
    resetPreviewUi();
    return;
  }

  const myGen = ++runGeneration;
  const signal = beginWork();
  submitBtn.disabled = true;
  downloadBtn.disabled = true;
  setStatus(reason === "auto" ? "Mise à jour de l’aperçu…" : "Traitement…");

  try {
    const result = await runPipeline(file, {
      ...opts,
      signal,
      onProgress: (msg) => {
        if (myGen === runGeneration) setStatus(msg);
      },
      onStep: async (step, canvas) => {
        if (myGen !== runGeneration) return;
        await showCanvasPreview(canvas, step);
      },
    });

    if (myGen !== runGeneration) return;

    if (result.kind === "svg") {
      showSvgPreview(result.svg);
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
      previewImg.src = previewUrl;
      previewImg.hidden = false;
      preview.hidden = false;
      downloadBtn.disabled = false;
      stepBadge.hidden = false;
      stepBadge.textContent = STEP_LABELS.done;
      previewLabel.textContent = opts.removeBg
        ? "PNG transparent — prêt à télécharger"
        : "Résultat — prêt à télécharger";
    }

    setStatus("Aperçu à jour — téléchargez pour garder le fichier.");
  } catch (err) {
    if (myGen !== runGeneration) return;
    if (err instanceof DOMException && err.name === "AbortError") {
      setStatus("Mise à jour…");
    } else {
      const message = err instanceof Error ? err.message : "Échec du traitement.";
      setStatus(message, true);
    }
  } finally {
    if (myGen === runGeneration) submitBtn.disabled = false;
  }
}

function scheduleLiveRun() {
  if (!getSourceFile() && !fileInput.files?.[0]) return;
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(() => {
    debounceTimer = null;
    void runLive("auto");
  }, 280);
}

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

dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  const dt = new DataTransfer();
  dt.items.add(file);
  fileInput.files = dt.files;
  assignSource(file);
  preloadModels();
  scheduleLiveRun();
});

fileInput.addEventListener("change", () => {
  assignSource(fileInput.files?.[0] ?? null);
  if (fileInput.files?.[0]) {
    preloadModels();
    scheduleLiveRun();
  }
});

upscaleSelect.addEventListener("change", scheduleLiveRun);
toSvgToggle.addEventListener("change", scheduleLiveRun);

downloadBtn.addEventListener("click", () => {
  if (!downloadResult()) {
    setStatus("Aucun résultat à télécharger.", true);
    return;
  }
  setStatus("Résultat téléchargé. Fermer l’onglet efface tout.");
});

clearBtn.addEventListener("click", async () => {
  runGeneration += 1;
  if (debounceTimer !== null) window.clearTimeout(debounceTimer);
  wipeSession();
  clearUiAssets();
  await disposePipelineResources();
  setStatus("Session vidée.");
});

form.addEventListener("submit", (e) => {
  e.preventDefault();
  void runLive("manual");
});

installSessionGuards(() => {
  runGeneration += 1;
  clearUiAssets();
  void disposePipelineResources();
});

const ric = (
  window as Window & {
    requestIdleCallback?: (
      cb: () => void,
      opts?: { timeout: number },
    ) => number;
  }
).requestIdleCallback;

if (typeof ric === "function") {
  ric(() => preloadModels(), { timeout: 2500 });
} else {
  setTimeout(() => preloadModels(), 1200);
}
