import "./styles.css";
import { runPipeline, type UpscaleFactor } from "./lib/pipeline";

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
const downloadLink = document.getElementById("download-link") as HTMLAnchorElement;

let objectUrl: string | null = null;
/** Ephemeral source file — never uploaded, cleared when replaced. */
let sourceFile: File | null = null;

function setStatus(message: string, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
}

function revokePreview() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
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

function setSourceFile(file: File | null) {
  sourceFile = file;
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
  setSourceFile(file);
});

fileInput.addEventListener("change", () => {
  setSourceFile(fileInput.files?.[0] ?? null);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const file = sourceFile ?? fileInput.files?.[0] ?? null;
  if (!file) {
    setStatus("Choisissez une image.", true);
    return;
  }

  const upscale = Number(
    (document.getElementById("upscale") as HTMLSelectElement).value,
  ) as UpscaleFactor;
  const removeBg = (document.getElementById("remove_bg") as HTMLInputElement).checked;
  const toSvg = (document.getElementById("to_svg") as HTMLInputElement).checked;

  if (upscale === 1 && !removeBg && !toSvg) {
    setStatus("Activez au moins une étape du pipeline.", true);
    return;
  }

  submitBtn.disabled = true;
  preview.hidden = true;
  revokePreview();
  setStatus("Préparation…");

  try {
    const result = await runPipeline(file, {
      upscale,
      removeBg,
      toSvg,
      onProgress: (msg) => setStatus(msg),
    });

    objectUrl = URL.createObjectURL(result.blob);
    previewImg.hidden = true;
    previewSvg.hidden = true;
    previewSvg.innerHTML = "";

    if (result.kind === "svg") {
      previewSvg.innerHTML = result.svg;
      previewSvg.hidden = false;
      previewLabel.textContent = "SVG vectorisé";
      downloadLink.download = "embelify.svg";
    } else {
      previewImg.src = objectUrl;
      previewImg.hidden = false;
      previewLabel.textContent = removeBg ? "PNG transparent" : "PNG embelli";
      downloadLink.download = "embelify.png";
    }

    downloadLink.href = objectUrl;
    preview.hidden = false;
    setStatus("Terminé — rien n’a quitté votre navigateur.");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Échec du traitement.";
    setStatus(message, true);
  } finally {
    submitBtn.disabled = false;
  }
});

// Drop in-memory references on unload (extra hygiene; GC does the rest)
window.addEventListener("pagehide", () => {
  revokePreview();
  sourceFile = null;
});
