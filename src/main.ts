import "./styles.css";
import {
  disposePipelineResources,
  preloadModels,
  runPipeline,
  type BgMode,
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
const downloadBtn = document.getElementById("download-btn") as HTMLButtonElement;
const clearBtn = document.getElementById("clear-btn") as HTMLButtonElement;
const removeBgToggle = document.getElementById("remove_bg") as HTMLInputElement;
const bgModeWrap = document.getElementById("bg-mode-wrap") as HTMLElement;

function syncBgModeVisibility() {
  bgModeWrap.hidden = !removeBgToggle.checked;
}
removeBgToggle.addEventListener("change", syncBgModeVisibility);
syncBgModeVisibility();

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
  // Warm models as soon as the user engages
  preloadModels();
});

fileInput.addEventListener("change", () => {
  assignSource(fileInput.files?.[0] ?? null);
  if (fileInput.files?.[0]) preloadModels();
});

downloadBtn.addEventListener("click", () => {
  if (!downloadResult()) {
    setStatus("Aucun résultat à télécharger.", true);
    return;
  }
  setStatus("Résultat téléchargé. Fermer l’onglet efface tout.");
});

clearBtn.addEventListener("click", async () => {
  wipeSession();
  clearUiAssets();
  await disposePipelineResources();
  setStatus("Session vidée.");
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const file = getSourceFile() ?? fileInput.files?.[0] ?? null;
  if (!file) {
    setStatus("Choisissez une image.", true);
    return;
  }
  assignSource(file);

  const upscale = Number(
    (document.getElementById("upscale") as HTMLSelectElement).value,
  ) as UpscaleFactor;
  const removeBg = (document.getElementById("remove_bg") as HTMLInputElement).checked;
  const bgMode = (document.getElementById("bg_mode") as HTMLSelectElement)
    .value as BgMode;
  const toSvg = (document.getElementById("to_svg") as HTMLInputElement).checked;

  if (upscale === 1 && !removeBg && !toSvg) {
    setStatus("Activez au moins une étape du pipeline.", true);
    return;
  }

  const signal = beginWork();
  submitBtn.disabled = true;
  downloadBtn.disabled = true;
  resetPreviewUi();
  setStatus("Préparation…");

  try {
    const result = await runPipeline(file, {
      upscale,
      removeBg,
      bgMode,
      toSvg,
      signal,
      onProgress: (msg) => setStatus(msg),
    });

    const filename =
      result.kind === "svg"
        ? "embelify.svg"
        : result.blob.type === "image/webp"
          ? "embelify.webp"
          : "embelify.png";

    const { previewUrl } = setResult({
      kind: result.kind,
      blob: result.blob,
      svg: result.kind === "svg" ? result.svg : undefined,
      filename,
    });

    if (result.kind === "svg") {
      previewSvg.innerHTML = result.svg;
      previewSvg.hidden = false;
      previewLabel.textContent = "SVG prêt — téléchargez-le maintenant";
    } else {
      previewImg.src = previewUrl;
      previewImg.hidden = false;
      previewLabel.textContent = removeBg
        ? "PNG transparent — téléchargez-le maintenant"
        : "Résultat prêt — téléchargez-le maintenant";
    }

    preview.hidden = false;
    downloadBtn.disabled = false;

    // Delivery = download only (no cloud storage)
    downloadResult();
    setStatus("Terminé — résultat téléchargé. Rien n’est stocké côté serveur.");
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      setStatus("Traitement annulé.");
    } else {
      const message = err instanceof Error ? err.message : "Échec du traitement.";
      setStatus(message, true);
    }
  } finally {
    submitBtn.disabled = false;
  }
});

installSessionGuards(() => {
  clearUiAssets();
  void disposePipelineResources();
});

// Idle preload after first paint — faster first "Embellir"
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
