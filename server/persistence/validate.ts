export class InvalidFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidFileError";
  }
}

export const MAX_PHOTO_BYTES = 20 * 1024 * 1024; // 20MB
export const MIN_PHOTO_BYTES = 512;
export const MAX_GLB_BYTES = 150 * 1024 * 1024; // 150MB

function startsWith(buffer: Buffer, bytes: number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buffer[offset + i] === b);
}

export type DetectedPhotoType = "image/jpeg" | "image/png" | "image/webp";

/** Sniffs magic bytes rather than trusting the client-declared MIME type. */
export function detectPhotoType(buffer: Buffer): DetectedPhotoType | null {
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) && startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "image/webp";
  }
  return null;
}

export function assertValidPhoto(buffer: Buffer): DetectedPhotoType {
  if (buffer.byteLength < MIN_PHOTO_BYTES) {
    throw new InvalidFileError(`File is too small to be a real photo (${buffer.byteLength} bytes)`);
  }
  if (buffer.byteLength > MAX_PHOTO_BYTES) {
    throw new InvalidFileError(`Photo exceeds the ${MAX_PHOTO_BYTES}-byte limit`);
  }
  const type = detectPhotoType(buffer);
  if (!type) {
    throw new InvalidFileError("File is not a recognized JPEG, PNG, or WebP image (magic bytes did not match)");
  }
  return type;
}

/** Binary glTF: 4-byte magic "glTF", uint32 LE version, uint32 LE total length. */
export function assertValidGlb(buffer: Buffer): void {
  if (buffer.byteLength < 12) {
    throw new InvalidFileError("File is too small to be a valid GLB");
  }
  if (buffer.byteLength > MAX_GLB_BYTES) {
    throw new InvalidFileError(`GLB exceeds the ${MAX_GLB_BYTES}-byte limit`);
  }
  if (!startsWith(buffer, [0x67, 0x6c, 0x54, 0x46])) {
    throw new InvalidFileError('File does not start with the binary glTF magic ("glTF")');
  }
  const version = buffer.readUInt32LE(4);
  if (version !== 2) {
    throw new InvalidFileError(`Unsupported glTF binary version ${version} (expected 2)`);
  }
  const declaredLength = buffer.readUInt32LE(8);
  if (declaredLength !== buffer.byteLength) {
    throw new InvalidFileError(
      `GLB header declares length ${declaredLength} but file is ${buffer.byteLength} bytes`,
    );
  }
}
