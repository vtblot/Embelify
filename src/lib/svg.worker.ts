/// <reference lib="webworker" />

import ImageTracer from "imagetracerjs";

export type SvgWorkerRequest = {
  width: number;
  height: number;
  /** RGBA buffer (transferable). */
  buffer: ArrayBuffer;
};

export type SvgWorkerResponse =
  | { ok: true; svg: string }
  | { ok: false; error: string };

const OPTIONS = {
  ltres: 1,
  qtres: 1,
  pathomit: 8,
  colorsampling: 2,
  numberofcolors: 24,
  strokewidth: 0,
  blurradius: 0,
  blurdelta: 20,
  scale: 1,
  viewbox: true,
} as const;

self.onmessage = (event: MessageEvent<SvgWorkerRequest>) => {
  try {
    const { width, height, buffer } = event.data;
    const imageData = new ImageData(new Uint8ClampedArray(buffer), width, height);
    const svg = ImageTracer.imagedataToSVG(imageData, OPTIONS);
    const response: SvgWorkerResponse = { ok: true, svg };
    (self as DedicatedWorkerGlobalScope).postMessage(response);
  } catch (err) {
    const response: SvgWorkerResponse = {
      ok: false,
      error: err instanceof Error ? err.message : "Vectorisation impossible.",
    };
    (self as DedicatedWorkerGlobalScope).postMessage(response);
  }
};
