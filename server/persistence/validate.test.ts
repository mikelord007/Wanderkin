import { describe, expect, it } from "vitest";
import { InvalidFileError, assertValidGlb, assertValidPhoto, detectPhotoType } from "./validate.js";

function jpegBytes(size = 2000): Buffer {
  const buffer = Buffer.alloc(size, 0);
  buffer[0] = 0xff;
  buffer[1] = 0xd8;
  buffer[2] = 0xff;
  return buffer;
}

function glbBytes(totalLength = 12): Buffer {
  const buffer = Buffer.alloc(totalLength);
  buffer.write("glTF", 0, "ascii");
  buffer.writeUInt32LE(2, 4);
  buffer.writeUInt32LE(totalLength, 8);
  return buffer;
}

describe("detectPhotoType / assertValidPhoto", () => {
  it("accepts a real JPEG magic-byte prefix", () => {
    expect(detectPhotoType(jpegBytes())).toBe("image/jpeg");
    expect(() => assertValidPhoto(jpegBytes())).not.toThrow();
  });

  it("rejects a file with a .jpg-shaped size but no image magic bytes (e.g. a renamed script)", () => {
    const fakeImage = Buffer.alloc(2000, 0x41); // all 'A'
    expect(detectPhotoType(fakeImage)).toBeNull();
    expect(() => assertValidPhoto(fakeImage)).toThrow(InvalidFileError);
  });

  it("rejects an oversized photo", () => {
    const huge = jpegBytes(21 * 1024 * 1024);
    expect(() => assertValidPhoto(huge)).toThrow(InvalidFileError);
  });

  it("rejects a suspiciously tiny file", () => {
    expect(() => assertValidPhoto(jpegBytes(10))).toThrow(InvalidFileError);
  });
});

describe("assertValidGlb", () => {
  it("accepts a well-formed binary glTF header", () => {
    expect(() => assertValidGlb(glbBytes())).not.toThrow();
  });

  it("rejects a file missing the glTF magic bytes", () => {
    const notGlb = Buffer.alloc(20, 0);
    expect(() => assertValidGlb(notGlb)).toThrow(InvalidFileError);
  });

  it("rejects a header whose declared length lies about the real file size", () => {
    const buffer = glbBytes(12);
    buffer.writeUInt32LE(999_999, 8); // declares far more than the actual 12 bytes
    expect(() => assertValidGlb(buffer)).toThrow(InvalidFileError);
  });

  it("rejects an unsupported glTF binary version", () => {
    const buffer = glbBytes();
    buffer.writeUInt32LE(1, 4);
    expect(() => assertValidGlb(buffer)).toThrow(InvalidFileError);
  });
});
