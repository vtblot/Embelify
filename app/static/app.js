const form = document.getElementById("pipeline-form");
const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("file-input");
const fileName = document.getElementById("file-name");
const submitBtn = document.getElementById("submit-btn");
const statusEl = document.getElementById("status");
const preview = document.getElementById("preview");
const previewImg = document.getElementById("preview-img");
const previewSvg = document.getElementById("preview-svg");
const previewLabel = document.getElementById("preview-label");
const downloadLink = document.getElementById("download-link");

let objectUrl = null;

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.classList.toggle("is-error", isError);
}

function revokePreview() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

function showFileName(file) {
  if (!file) {
    fileName.hidden = true;
    fileName.textContent = "";
    return;
  }
  fileName.hidden = false;
  fileName.textContent = file.name;
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
  showFileName(file);
});

fileInput.addEventListener("change", () => {
  showFileName(fileInput.files?.[0] ?? null);
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();

  const file = fileInput.files?.[0];
  if (!file) {
    setStatus("Choisissez une image.", true);
    return;
  }

  const upscale = document.getElementById("upscale").value;
  const removeBg = document.getElementById("remove_bg").checked;
  const toSvg = document.getElementById("to_svg").checked;

  if (upscale === "1" && !removeBg && !toSvg) {
    setStatus("Activez au moins une étape du pipeline.", true);
    return;
  }

  const body = new FormData();
  body.append("file", file);
  body.append("upscale", upscale);
  body.append("remove_bg", removeBg ? "true" : "false");
  body.append("to_svg", toSvg ? "true" : "false");

  submitBtn.disabled = true;
  setStatus("Traitement en cours… (le premier lancement peut télécharger les modèles)");
  preview.hidden = true;
  revokePreview();

  try {
    const res = await fetch("/api/process", { method: "POST", body });
    if (!res.ok) {
      let detail = "Erreur serveur.";
      try {
        const err = await res.json();
        detail = err.detail || detail;
      } catch {
        /* ignore */
      }
      throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    }

    const blob = await res.blob();
    const type = res.headers.get("content-type") || blob.type;
    objectUrl = URL.createObjectURL(blob);

    previewImg.hidden = true;
    previewSvg.hidden = true;
    previewSvg.innerHTML = "";

    if (type.includes("svg")) {
      const text = await blob.text();
      // Re-create blob URL for download after reading text
      revokePreview();
      objectUrl = URL.createObjectURL(new Blob([text], { type: "image/svg+xml" }));
      previewSvg.innerHTML = text;
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
    setStatus("Terminé.");
  } catch (err) {
    setStatus(err.message || "Échec du traitement.", true);
  } finally {
    submitBtn.disabled = false;
  }
});
