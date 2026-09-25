/**
 * Ground contact for clusters, in one instanced draw: a soft, dark contact
 * blob under every cluster (the ambient occlusion a prop throws on the
 * ground) and, under some clusters, a subtle soil/sand patch with a wobbly
 * edge, optionally cracked like dried earth (`ground.cracks`), the cracks
 * optionally glowing like cooling lava (`ground.crackGlow`). All stay
 * inside the cluster's footprint, lie on its support plane,
 * never write depth, and draw before gameplay rings (renderOrder 0), so they
 * can never hide a spawn, checkpoint or collectible marker.
 */
import * as THREE from "three";
import type { ComposedCluster } from "../assets/compose.js";
import type { GroundStyle } from "../assets/types.js";
import type { OwnedObject } from "./atmosphereEffects.js";
import { seededRandom } from "./selection.js";

/** Gameplay readability (§9): decal alpha never exceeds this. */
export const MAX_CONTACT_OPACITY = 0.45;

export function createContactDecals(
  clusters: readonly ComposedCluster[],
  ground: GroundStyle,
  seed: string,
): OwnedObject<THREE.InstancedMesh> | null {
  if (clusters.length === 0 || !(ground.contactOpacity > 0)) return null;
  const random = seededRandom(`${seed}:contact`);
  type Decal = { cluster: ComposedCluster; radius: number; color: THREE.Color; opacity: number; patch: number };
  const decals: Decal[] = [];
  const contact = new THREE.Color(ground.contactColor);
  const soil = ground.patchColor ? new THREE.Color(ground.patchColor) : null;
  const crackShare = Math.min(1, Math.max(0, ground.cracks ?? 0));
  for (const cluster of clusters) {
    // Patch first (drawn under the blob), only sometimes, never the whole scene.
    if (soil && random() < 0.55) {
      const cracked = random() < crackShare;
      decals.push({
        cluster,
        radius: cluster.radius * (0.85 + random() * 0.15),
        color: soil.clone().offsetHSL(0, 0, (random() - 0.5) * 0.05),
        opacity: cracked ? 0.42 : 0.3,
        patch: cracked ? 2 : 1,
      });
    }
    decals.push({ cluster, radius: cluster.radius * Math.min(1, ground.contactScale) * 0.8, color: contact, opacity: Math.min(MAX_CONTACT_OPACITY, ground.contactOpacity), patch: 0 });
  }

  const geometry = new THREE.CircleGeometry(1, 24);
  geometry.rotateX(-Math.PI / 2);
  const opacity = new Float32Array(decals.length);
  const kind = new Float32Array(decals.length);
  const material = new THREE.MeshBasicMaterial({
    color: "#ffffff",
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const glow = ground.crackGlow && crackShare > 0 ? new THREE.Color(ground.crackGlow) : null;
  if (glow) material.defines = { OQ_CRACK_GLOW: "" };
  material.onBeforeCompile = (shader) => {
    if (glow) shader.uniforms.uCrackGlow = { value: glow };
    shader.vertexShader = `attribute float aOpacity;\nattribute float aPatch;\nvarying float oqOpacity;\nvarying float oqPatch;\nvarying vec2 oqLocal;\nvarying float oqSeed;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      oqOpacity = aOpacity;
      oqPatch = aPatch;
      oqLocal = transformed.xz;
      #ifdef USE_INSTANCING
        oqSeed = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453) * 40.0;
      #else
        oqSeed = 0.0;
      #endif`,
    );
    shader.fragmentShader = `varying float oqOpacity;\nvarying float oqPatch;\nvarying vec2 oqLocal;\nvarying float oqSeed;
      #ifdef OQ_CRACK_GLOW
        uniform vec3 uCrackGlow;
      #endif
      float oqContactHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
      // Distance to the nearest cell border (cell noise F2 - F1): crack lines.
      float oqCrackEdge(vec2 p) {
        vec2 g = floor(p); vec2 f = fract(p);
        float f1 = 8.0; float f2 = 8.0;
        for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
          vec2 o = vec2(float(x), float(y));
          vec2 c = o + vec2(oqContactHash(g + o), oqContactHash(g + o + 17.0)) - f;
          float d = dot(c, c);
          if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
        }
        return sqrt(f2) - sqrt(f1);
      }
      float oqContactNoise(vec2 p) {
        vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(oqContactHash(i), oqContactHash(i + vec2(1.0, 0.0)), u.x), mix(oqContactHash(i + vec2(0.0, 1.0)), oqContactHash(i + vec2(1.0, 1.0)), u.x), u.y);
      }
      ${shader.fragmentShader}`.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      {
        float r = length(oqLocal);
        // Blob: soft falloff, darkest at the base. Patch: wobbly drift edge.
        float blob = pow(1.0 - smoothstep(0.1, 1.0, r), 1.6);
        float wob = oqContactNoise(oqLocal / max(r, 1e-4) * 1.5 + oqSeed);
        float oqPatchMask = 1.0 - smoothstep(0.55 + 0.3 * wob - 0.25, 0.55 + 0.3 * wob, r);
        float oqIsPatch = step(0.5, oqPatch);
        float oqIsCrack = step(1.5, oqPatch);
        // Dried earth: darker crack lines on the patch, fading to its edge.
        float oqCrack = (1.0 - smoothstep(0.03, 0.09, oqCrackEdge(oqLocal * 3.2 + oqSeed))) * oqIsCrack;
        diffuseColor.rgb *= 1.0 - 0.45 * oqCrack;
        diffuseColor.a *= oqOpacity * mix(blob, oqPatchMask * (1.0 + 0.6 * oqCrack), oqIsPatch);
        #ifdef OQ_CRACK_GLOW
          // Unlit material: the crack colour itself is the glow, brightest
          // at the patch centre and cooling toward its edge.
          float oqGlow = oqCrack * oqPatchMask * (1.0 - smoothstep(0.2, 0.75, r));
          diffuseColor.rgb = mix(diffuseColor.rgb, uCrackGlow, oqGlow);
          diffuseColor.a = max(diffuseColor.a, 0.92 * oqGlow);
        #endif
        if (diffuseColor.a < 0.01) discard;
      }`,
    );
  };
  material.customProgramCacheKey = () => (glow ? "objectquest-biome-contact-glow-v1" : "objectquest-biome-contact-v2");

  const mesh = new THREE.InstancedMesh(geometry, material, decals.length);
  mesh.name = "biome-contact";
  mesh.renderOrder = 0;
  const up = new THREE.Vector3(0, 1, 0);
  const normal = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  decals.forEach((decal, index) => {
    const [x, y, z] = decal.cluster.base;
    normal.set(...decal.cluster.normal).normalize();
    quaternion.setFromUnitVectors(up, normal);
    const lift = decal.cluster.height * 0.004 + 0.0005 * (1 + decal.patch);
    position.set(x + normal.x * lift, y + normal.y * lift, z + normal.z * lift);
    scale.set(decal.radius, 1, decal.radius);
    matrix.compose(position, quaternion, scale);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, decal.color);
    opacity[index] = decal.opacity;
    kind[index] = decal.patch;
  });
  geometry.setAttribute("aOpacity", new THREE.InstancedBufferAttribute(opacity, 1));
  geometry.setAttribute("aPatch", new THREE.InstancedBufferAttribute(kind, 1));
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  return { object: mesh, geometries: [geometry], materials: [material] };
}
