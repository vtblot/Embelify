/** Client-side image gate — MIME / magic bytes / size before decode. */

export const MAX_INPUT_BYTES = 25 * 1024 * 1024;

export const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/bmp",
]);

export type ImageValidationCode = "tooLarge" | "badType" | "badImage";

export class ImageValidationError extends Error {
  readonly code: ImageValidationCode;

  constructor(code: ImageValidationCode) {
    super(code);
    this.name = "ImageValidationError";
    this.code = code;
  }
}

function matchesMagic(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;

  // PNG
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return true;
  }

  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return true;
  }

  // GIF
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return true;
  }

  // BMP
  if (bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return true;
  }

  // WEBP: RIFF....WEBP
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return true;
  }

  return false;
}

/**
 * Reject oversized / non-image payloads before the ML pipeline runs.
 * `accept` on the file input is UI-only — this is the real gate.
 */
export async function validateImageFile(file: File): Promise<void> {
  if (file.size <= 0 || file.size > MAX_INPUT_BYTES) {
    throw new ImageValidationError("tooLarge");
  }

  const mime = (file.type || "").toLowerCase();
  if (mime && !ALLOWED_MIME.has(mime)) {
    throw new ImageValidationError("badType");
  }

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!matchesMagic(header)) {
    throw new ImageValidationError("badType");
  }

  try {
    const bitmap = await createImageBitmap(file);
    const ok = bitmap.width > 0 && bitmap.height > 0;
    bitmap.close();
    if (!ok) throw new ImageValidationError("badImage");
  } catch (err) {
    if (err instanceof ImageValidationError) throw err;
    throw new ImageValidationError("badImage");
  }
}
