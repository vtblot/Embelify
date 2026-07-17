/** Ephemeral in-tab session. Nothing is persisted; wipe on close. */

export type SessionResult = {
  kind: "png" | "svg";
  blob: Blob;
  /** Full SVG markup when kind === "svg" (for preview only). */
  svg?: string;
  filename: string;
};

type SessionState = {
  sourceFile: File | null;
  result: SessionResult | null;
  objectUrl: string | null;
  previewUrl: string | null;
  abort: AbortController | null;
};

const state: SessionState = {
  sourceFile: null,
  result: null,
  objectUrl: null,
  previewUrl: null,
  abort: null,
};

function revoke(url: string | null) {
  if (url) URL.revokeObjectURL(url);
}

export function getSourceFile(): File | null {
  return state.sourceFile;
}

export function setSourceFile(file: File | null) {
  state.sourceFile = file;
}

export function beginWork(): AbortSignal {
  state.abort?.abort();
  state.abort = new AbortController();
  return state.abort.signal;
}

export function clearResult() {
  revoke(state.objectUrl);
  revoke(state.previewUrl);
  state.objectUrl = null;
  state.previewUrl = null;
  state.result = null;
}

export function setResult(result: SessionResult): { downloadUrl: string; previewUrl: string } {
  clearResult();
  state.result = result;
  state.objectUrl = URL.createObjectURL(result.blob);
  // Same blob URL is fine for preview; keep a dedicated slot if we later downscale
  state.previewUrl = state.objectUrl;
  return { downloadUrl: state.objectUrl, previewUrl: state.previewUrl };
}

export function getResult(): SessionResult | null {
  return state.result;
}

export function getDownloadUrl(): string | null {
  return state.objectUrl;
}

/** Trigger a user download of the current result (delivery = download only). */
export function downloadResult(): boolean {
  if (!state.objectUrl || !state.result) return false;
  const a = document.createElement("a");
  a.href = state.objectUrl;
  a.download = state.result.filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  return true;
}

/**
 * Wipe all user assets held in this tab.
 * Call on pagehide / freeze / explicit reset. Does not clear browser model caches.
 */
export function wipeSession() {
  state.abort?.abort();
  state.abort = null;
  clearResult();
  state.sourceFile = null;
}

export function installSessionGuards(onWipe?: () => void) {
  const wipe = () => {
    wipeSession();
    onWipe?.();
  };

  // pagehide covers tab close, navigation, and bfcache entry
  window.addEventListener("pagehide", wipe);
  // Safari / older paths
  window.addEventListener("beforeunload", wipe);
  // Mobile Chrome may freeze background tabs
  document.addEventListener("freeze", wipe);

  return () => {
    window.removeEventListener("pagehide", wipe);
    window.removeEventListener("beforeunload", wipe);
    document.removeEventListener("freeze", wipe);
  };
}
