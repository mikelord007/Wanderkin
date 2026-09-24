export const MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;
export const MAX_SOURCE_IMAGE_DIMENSION = 12_000;
export const MIN_SOURCE_IMAGE_DIMENSION = 128;

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export interface ValidatedImage {
  width: number;
  height: number;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
}

export interface ImageDecoder {
  (file: File): Promise<{ width: number; height: number; close?: () => void }>;
}

export async function validateImageFile(file: File, decode: ImageDecoder = decodeImage): Promise<ValidatedImage> {
  if (file.size === 0) throw new Error("This photo is empty. Choose a different image.");
  if (file.size > MAX_SOURCE_IMAGE_BYTES) {
    throw new Error("This photo is larger than 20 MB. Choose a smaller image.");
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Choose a JPEG, PNG, or WebP photo.");
  }
  const bytes = new Uint8Array(await file.slice(0, 32).arrayBuffer());
  if (!signatureMatches(file.type, bytes)) {
    throw new Error("This file does not appear to be a valid photo. Try another JPEG, PNG, or WebP image.");
  }
  let decoded: Awaited<ReturnType<ImageDecoder>>;
  try {
    decoded = await decode(file);
  } catch {
    throw new Error("This photo could not be opened. Try exporting it as JPEG or PNG.");
  }
  const { width, height } = decoded;
  decoded.close?.();
  if (width < MIN_SOURCE_IMAGE_DIMENSION || height < MIN_SOURCE_IMAGE_DIMENSION) {
    throw new Error("This photo is too small. Choose one at least 128 × 128 pixels.");
  }
  if (width > MAX_SOURCE_IMAGE_DIMENSION || height > MAX_SOURCE_IMAGE_DIMENSION) {
    throw new Error("This photo has very large dimensions. Resize it below 12,000 pixels per side.");
  }
  return { width, height, mimeType: file.type as ValidatedImage["mimeType"] };
}

export function signatureMatches(mimeType: string, bytes: Uint8Array): boolean {
  if (mimeType === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value);
  if (mimeType === "image/webp") {
    return ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
  }
  return false;
}

async function decodeImage(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: "from-image" });
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

