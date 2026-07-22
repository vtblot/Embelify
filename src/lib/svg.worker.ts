/// <reference lib="webworker" />

import ImageTracer from "imagetracerjs";
import type { SvgTraceOptions } from "./svgOptions";

export type SvgWorkerRequest = {
  width: number;
  height: number;
  /** RGBA buffer (transferable). */
  buffer: ArrayBuffer;
  options: SvgTraceOptions;
};

export type SvgWorkerResponse =
  | { ok: true; svg: string }
  | { ok: false; error: string };

self.onmessage = (event: MessageEvent<SvgWorkerRequest>) => {
  try {
    const { width, height, buffer, options } = event.data;
    const imageData = new ImageData(new Uint8ClampedArray(buffer), width, height);
    const svg = ImageTracer.imagedataToSVG(imageData, options);
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
