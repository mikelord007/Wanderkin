export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ImageDimensionLimits {
  maxWidth: number;
  maxHeight: number;
  maxPixels: number;
}

export class ImageDimensionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageDimensionError";
  }
}

export class DecodeBudgetExceededError extends Error {
  constructor() {
    super("The server is at its image decode capacity. Please retry shortly.");
    this.name = "DecodeBudgetExceededError";
  }
}

/** Reserves worst-case RGBA bytes across concurrently processed uploads. */
export class ImageDecodeBudget {
  private reservedBytes = 0;

  constructor(readonly maxBytes: number) {}

  acquire(bytes: number): () => void {
    if (!Number.isSafeInteger(bytes) || bytes < 0 || this.reservedBytes + bytes > this.maxBytes) {
      throw new DecodeBudgetExceededError();
    }
    this.reservedBytes += bytes;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.reservedBytes -= bytes;
    };
  }
}

export function inspectImageDimensions(buffer: Buffer): ImageDimensions {
  const dimensions = pngDimensions(buffer) ?? jpegDimensions(buffer) ?? webpDimensions(buffer);
  if (!dimensions || dimensions.width < 1 || dimensions.height < 1) {
    throw new ImageDimensionError("The uploaded image dimensions could not be safely determined.");
  }
  return dimensions;
}

export function assertImageDimensions(buffer: Buffer, limits: ImageDimensionLimits): ImageDimensions {
  const dimensions = inspectImageDimensions(buffer);
  const pixels = dimensions.width * dimensions.height;
  if (
    dimensions.width > limits.maxWidth ||
    dimensions.height > limits.maxHeight ||
    !Number.isSafeInteger(pixels) ||
    pixels > limits.maxPixels
  ) {
    throw new ImageDimensionError(
      `Image dimensions ${dimensions.width}x${dimensions.height} exceed the allowed decoded-pixel limit.`,
    );
  }
  return dimensions;
}

function pngDimensions(buffer: Buffer): ImageDimensions | undefined {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return undefined;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function jpegDimensions(buffer: Buffer): ImageDimensions | undefined {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset + 4 <= buffer.length) {
    if (buffer[offset] !== 0xff) { offset += 1; continue; }
    while (offset < buffer.length && buffer[offset] === 0xff) offset += 1;
    const marker = buffer[offset];
    offset += 1;
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame && length >= 7) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  return undefined;
}

function webpDimensions(buffer: Buffer): ImageDimensions | undefined {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") return undefined;
  const kind = buffer.toString("ascii", 12, 16);
  if (kind === "VP8X") {
    return { width: 1 + buffer.readUIntLE(24, 3), height: 1 + buffer.readUIntLE(27, 3) };
  }
  if (kind === "VP8 " && buffer.length >= 30 && buffer.subarray(23, 26).equals(Buffer.from([0x9d, 0x01, 0x2a]))) {
    return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
  }
  if (kind === "VP8L" && buffer.length >= 25 && buffer[20] === 0x2f) {
    const b21 = buffer[21] ?? 0;
    const b22 = buffer[22] ?? 0;
    const b23 = buffer[23] ?? 0;
    const b24 = buffer[24] ?? 0;
    return {
      width: 1 + b21 + ((b22 & 0x3f) << 8),
      height: 1 + (b22 >> 6) + (b23 << 2) + ((b24 & 0x0f) << 10),
    };
  }
  return undefined;
}
