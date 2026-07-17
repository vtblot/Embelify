/// <reference types="vite/client" />

declare module "imagetracerjs" {
  type ImageTracerOptions = Record<string, string | number | boolean>;

  interface ImageTracerApi {
    imagedataToSVG(imageData: ImageData, options?: ImageTracerOptions): string;
    imageToSVG(
      url: string,
      callback: (svg: string) => void,
      options?: ImageTracerOptions,
    ): void;
  }

  const ImageTracer: ImageTracerApi;
  export default ImageTracer;
}

declare module "@upscalerjs/esrgan-slim/2x" {
  const model: unknown;
  export default model;
}

declare module "@upscalerjs/esrgan-slim/4x" {
  const model: unknown;
  export default model;
}

