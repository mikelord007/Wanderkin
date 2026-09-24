import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { STYLE_EXAMPLES, STYLE_REFERENCE } from "./StyleExample.js";

/**
 * The Look step promises something specific: one real photograph and three
 * genuine restyles OF THAT SAME PHOTOGRAPH. That promise is easy to break by
 * accident — a broken path, a stray stock image, a CSS filter standing in for
 * a real render — and none of those break the type checker. These tests hold
 * the promise to the bytes on disk and to the recorded provenance.
 */

const repoRoot = path.resolve(__dirname, "../../..");
const publicFile = (webPath: string) => path.join(repoRoot, "public", webPath.replace(/^\//, ""));

interface Provenance {
  source: { file: string; sha256: string };
  provider: { servedModel: string; fallbackUsed: boolean; automaticRetries: number };
  variants: { id: string; web: string; original: string; sha256: string; generated: boolean }[];
}
const provenance: Provenance = JSON.parse(
  readFileSync(path.join(repoRoot, "public/style-previews/provenance.json"), "utf8"),
);

const sha256 = (file: string) => createHash("sha256").update(readFileSync(file)).digest("hex");

describe("style example assets", () => {
  it("offers exactly the three world styles, once each", () => {
    expect(STYLE_EXAMPLES.map((example) => example.id)).toEqual([
      "cartoon",
      "hand-painted",
      "watercolor",
    ]);
  });

  it("ships every image it references, and none of them are empty", () => {
    for (const webPath of [STYLE_REFERENCE.src, ...STYLE_EXAMPLES.map((e) => e.src)]) {
      const file = publicFile(webPath);
      expect(statSync(file).size, `${webPath} should be a real image`).toBeGreaterThan(1024);
    }
  });

  it("uses a distinct image for the reference and for each look", () => {
    const digests = [STYLE_REFERENCE.src, ...STYLE_EXAMPLES.map((e) => e.src)].map((webPath) =>
      sha256(publicFile(webPath)),
    );
    expect(new Set(digests).size).toBe(4);
  });

  it("describes every image for screen readers without reusing one description", () => {
    const alts = [STYLE_REFERENCE.alt, ...STYLE_EXAMPLES.map((e) => e.alt)];
    expect(alts.every((alt) => alt.length > 20)).toBe(true);
    expect(new Set(alts).size).toBe(4);
  });
});

describe("style example provenance", () => {
  it("records the untouched provider originals, byte for byte", () => {
    for (const variant of provenance.variants) {
      expect(sha256(path.join(repoRoot, variant.original)), variant.id).toBe(variant.sha256);
    }
  });

  it("derives every look from the one source photo, not from separate pictures", () => {
    const reference = provenance.variants.find((variant) => variant.id === "reference");
    expect(reference?.generated).toBe(false);
    // The reference IS the repo's source photo — that is what makes the three
    // restyles same-source rather than four unrelated images.
    expect(sha256(path.join(repoRoot, provenance.source.file))).toBe(provenance.source.sha256);
    expect(reference?.sha256).toBe(provenance.source.sha256);

    const generated = provenance.variants.filter((variant) => variant.generated);
    expect(generated.map((variant) => variant.id)).toEqual(STYLE_EXAMPLES.map((e) => e.id));
  });

  it("records what actually served the request, with no silent paid retries", () => {
    expect(provenance.provider.servedModel).toBe("fal-ai/flux-pro/kontext");
    expect(provenance.provider.fallbackUsed).toBe(false);
    expect(provenance.provider.automaticRetries).toBe(0);
  });

  it("points the app at the same files the provenance vouches for", () => {
    for (const example of STYLE_EXAMPLES) {
      const variant = provenance.variants.find((entry) => entry.id === example.id);
      expect(variant?.web, example.id).toBe(`public${example.src}`);
    }
    expect(
      provenance.variants.find((variant) => variant.id === "reference")?.web,
    ).toBe(`public${STYLE_REFERENCE.src}`);
  });
});
