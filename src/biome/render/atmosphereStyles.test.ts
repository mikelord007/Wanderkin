/**
 * Wave 2 renderer styles: frozen / lava water, snow / ember particles, leaf
 * litter patches and glowing cracks. Each restyles an existing single draw;
 * the defaults (no art option) keep the previous programs and uniforms.
 */
import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { getBiomeDefinition } from "../presets.js";
import type { BiomeLayout } from "../types.js";
import { createParticleField, createSupportPatches, createWaterRing } from "./atmosphereEffects.js";
import { createBiomeLayer } from "./decorLayer.js";
import { createContactDecals } from "./contactDecals.js";
import { createWindUniforms } from "./wind.js";
import { composeLayout } from "../assets/compose.js";
import { getBiomeArt } from "../assets/biomes/index.js";

const WATER = { center: [0, -0.02, 0] as [number, number, number], innerRadius: 2.9, outerRadius: 6 };
const LAYOUT = {
  biomeId: "alpine",
  seed: "styles",
  props: [],
  patches: Array.from({ length: 12 }, (_, i) => ({ position: [i * 0.3 - 1.5, 0, 0] as const, normal: [0, 1, 0] as const, radius: 0.25 })),
  exclusions: [],
  bounds: { min: [-2, 0, -2], max: [2, 1, 2] },
  water: WATER,
  diagnostics: [],
} as unknown as BiomeLayout;

/** Runs a material's shader patch against the real three.js chunk sources. */
function compile(material: THREE.Material, lib: "standard" | "basic") {
  const source = THREE.ShaderLib[lib];
  const shader = { uniforms: {} as Record<string, THREE.IUniform>, vertexShader: source.vertexShader, fragmentShader: source.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, undefined as unknown as THREE.WebGLRenderer);
  return { shader, key: material.customProgramCacheKey() };
}

function disposeOwned(owned: { geometries: THREE.BufferGeometry[]; materials: THREE.Material[] }) {
  owned.geometries.forEach((g) => g.dispose());
  owned.materials.forEach((m) => m.dispose());
}

describe("water styles", () => {
  const wind = createWindUniforms(getBiomeDefinition("alpine").wind, false);

  it("liquid keeps its program; frozen is still (no clock) and pale; lava glows", () => {
    const liquid = createWaterRing(WATER, getBiomeDefinition("tropical"), wind)!;
    const { shader: l, key: lKey } = compile(liquid.materials[0]!, "standard");
    expect(lKey).toBe("objectquest-biome-water-v1");
    expect(l.uniforms.uWindTime).toBeDefined();

    const alpine = getBiomeDefinition("alpine");
    const frozen = createWaterRing(WATER, alpine, wind, "frozen")!;
    const frozenMaterial = frozen.materials[0] as THREE.MeshStandardMaterial;
    const { shader: f, key: fKey } = compile(frozenMaterial, "standard");
    expect(fKey).not.toBe(lKey);
    expect(f.uniforms.uWindTime).toBeUndefined();
    expect(f.fragmentShader).not.toContain("uWindTime");
    const hslOf = (c: THREE.Color) => c.getHSL({ h: 0, s: 0, l: 0 });
    expect(hslOf(frozenMaterial.color).l).toBeGreaterThan(hslOf(new THREE.Color(alpine.palette.water)).l);

    const lava = createWaterRing(WATER, getBiomeDefinition("ember"), wind, "lava")!;
    const lavaMaterial = lava.materials[0] as THREE.MeshStandardMaterial;
    const { shader: v, key: vKey } = compile(lavaMaterial, "standard");
    expect(new Set([lKey, fKey, vKey]).size).toBe(3);
    expect(lavaMaterial.emissive.getHex()).not.toBe(0);
    expect(v.fragmentShader).toContain("totalEmissiveRadiance *= oqLavaGlow");
    for (const owned of [liquid, frozen, lava]) {
      expect(owned.object.renderOrder).toBe(0);
      disposeOwned(owned);
    }
  });
});

describe("particle presets", () => {
  it("snow falls, embers rise and glow; dust and motes are unchanged", () => {
    const definition = getBiomeDefinition("alpine");
    const drift = (effect: "dust" | "motes" | "snow" | "embers") => {
      const wind = createWindUniforms(definition.wind, false);
      const field = createParticleField(effect, 50, LAYOUT, definition, wind);
      field.advance(0.05, 1);
      const y = (field.object.material as THREE.ShaderMaterial).uniforms.uDrift!.value.y as number;
      const blending = (field.object.material as THREE.ShaderMaterial).blending;
      const flutter = (field.object.material as THREE.ShaderMaterial).uniforms.uFlutter!.value as number;
      disposeOwned(field);
      return { y, blending, flutter };
    };
    expect(drift("snow").y).toBeLessThan(0);
    expect(drift("embers").y).toBeGreaterThan(0);
    expect(drift("embers").blending).toBe(THREE.AdditiveBlending);
    expect(drift("snow").blending).toBe(THREE.NormalBlending);
    expect(drift("dust")).toEqual({ y: 0, blending: THREE.NormalBlending, flutter: 0.004 });
    expect(drift("motes").y).toBeGreaterThan(0);
    expect(drift("motes").flutter).toBe(0.004);
  });

  it("an art tint replaces only the colour; unset keeps each look's own colour", () => {
    const definition = getBiomeDefinition("alpine");
    const colour = (effect: "dust" | "motes" | "snow" | "embers", tint?: string) => {
      const field = createParticleField(effect, 20, LAYOUT, definition, createWindUniforms(definition.wind, false), tint);
      const material = field.object.material as THREE.ShaderMaterial;
      const out = { hex: (material.uniforms.uColor!.value as THREE.Color).getHexString(), opacity: material.uniforms.uOpacity!.value as number, blending: material.blending, rand: Array.from(field.geometries[0]!.getAttribute("aRand").array) };
      disposeOwned(field);
      return out;
    };
    expect(colour("snow").hex).toBe("fbfdff");
    expect(colour("embers").hex).toBe("ff8a3a");
    expect(colour("motes").hex).toBe("fff6d8");
    expect(colour("dust").hex).toBe(new THREE.Color(definition.palette.sand).getHexString());
    const tinted = colour("snow", "#b4c2d4");
    const plain = colour("snow");
    expect(tinted.hex).toBe("b4c2d4");
    // Everything else (stream, opacity, blending) is untouched.
    expect({ ...tinted, hex: plain.hex }).toEqual(plain);
    expect(colour("embers", "#d8623a").blending).toBe(THREE.AdditiveBlending);
  });
});

describe("ground patch styles", () => {
  it("litter adds leaf flecks in its own program; no style keeps the default program", () => {
    const definition = getBiomeDefinition("autumn");
    const plain = createSupportPatches(LAYOUT.patches, definition, "s")!;
    const { key: plainKey, shader: p } = compile(plain.materials[0]!, "standard");
    expect(plainKey).toBe("objectquest-biome-patch-v2");
    expect(p.uniforms.uLitter0).toBeUndefined();
    const litter = createSupportPatches(LAYOUT.patches, definition, "s", {
      tints: [{ color: "#7a5636", weight: 1 }],
      litter: ["#c2622a", "#9c3525"],
    })!;
    const { key: litterKey, shader: q } = compile(litter.materials[0]!, "standard");
    expect(litterKey).not.toBe(plainKey);
    expect(litter.materials[0]!.defines).toHaveProperty("OQ_LITTER");
    expect(q.uniforms.uLitter0).toBeDefined();
    // Art tints replace the default sand colour, one tint per patch.
    const colours = new Set<number>();
    const colour = new THREE.Color();
    for (let i = 0; i < LAYOUT.patches.length; i += 1) {
      litter.object.getColorAt(i, colour);
      colours.add(Math.round(colour.r * 255));
    }
    // (± the per-patch lightness jitter of 0.03.)
    const tint = new THREE.Color("#7a5636").offsetHSL(0, 0.04, 0);
    for (const r of colours) expect(Math.abs(r - tint.r * 255)).toBeLessThanOrEqual(18);
    disposeOwned(plain);
    disposeOwned(litter);
  });

  it("the Tropical default (no art patch style) is unchanged: grass and sand tints", () => {
    const owned = createSupportPatches(LAYOUT.patches, getBiomeDefinition("tropical"), "s")!;
    expect(owned.materials[0]!.defines ?? {}).not.toHaveProperty("OQ_LITTER");
    disposeOwned(owned);
  });
});

describe("glowing cracks", () => {
  it("tints crack lines only when the art asks, in the same single draw", () => {
    const art = getBiomeArt("ember")!;
    const placements = Array.from({ length: 12 }, (_, i) => ({
      placement: { id: `r${i}`, kind: "rock" as const, position: [i * 0.4 - 2, 0, 0] as [number, number, number], normal: [0, 1, 0] as [number, number, number], scale: 0.2, yaw: i, radius: 0.2 },
      height: 0.2,
    }));
    const clusters = composeLayout(art, placements, "glow", "standard").clusters;
    const glow = createContactDecals(clusters, art.ground, "glow")!;
    const { crackGlow: _glow, ...plainGround } = art.ground;
    const plain = createContactDecals(clusters, plainGround, "glow")!;
    const noCracks = createContactDecals(clusters, { ...art.ground, cracks: 0 }, "glow")!;
    const g = compile(glow.materials[0]!, "basic");
    const p = compile(plain.materials[0]!, "basic");
    expect(p.key).toBe("objectquest-biome-contact-v2");
    expect(g.key).not.toBe(p.key);
    expect(g.shader.uniforms.uCrackGlow).toBeDefined();
    expect(glow.materials[0]!.defines).toHaveProperty("OQ_CRACK_GLOW");
    // Glow without cracks is meaningless and falls back to the plain program.
    expect(compile(noCracks.materials[0]!, "basic").key).toBe(p.key);
    // Same instances, same single draw.
    expect(glow.object.count).toBe(plain.object.count);
    for (const owned of [glow, plain, noCracks]) disposeOwned(owned);
  });
});

describe("Wave 2 biomes in the decoration layer", () => {
  it("each draws within its budget, with its styled water and particles, and disposes cleanly", () => {
    for (const id of ["alpine", "autumn", "ember"] as const) {
      const definition = getBiomeDefinition(id);
      const layout = { ...LAYOUT, biomeId: id } as BiomeLayout;
      const layer = createBiomeLayer({ definition, layout, quality: "standard", reducedMotion: false });
      expect(layer.stats.drawCalls).toBeLessThanOrEqual(definition.budget.drawCalls);
      expect(layer.stats.water).toBe(definition.ambient.water);
      const particles = layer.root.children.find((child) => child.name.startsWith("biome-particles:"));
      const expected = { alpine: "snow", autumn: "motes", ember: "embers" }[id];
      expect(particles?.name).toBe(`biome-particles:${expected}`);
      // The art's particle tint (if any) reaches the draw; otherwise the look's colour.
      const defaults = { snow: "#fbfdff", motes: "#fff6d8", embers: "#ff8a3a" };
      const tint = getBiomeArt(id)!.atmosphere?.particleTint ?? defaults[expected as keyof typeof defaults];
      const uColor = ((particles as THREE.Points).material as THREE.ShaderMaterial).uniforms.uColor!.value as THREE.Color;
      expect(uColor.getHexString()).toBe(new THREE.Color(tint).getHexString());
      layer.dispose();
    }
  });
});
