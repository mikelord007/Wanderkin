import type { TriangleSoup } from "./types.js";

/**
 * Dependency-free glTF-binary reader that extracts *only* world-space triangle
 * positions.
 *
 * Why this exists next to three.js' GLTFLoader: the loader needs a DOM to
 * decode embedded textures, so it cannot run in Node. Surface analysis, course
 * validation, and their tests all need real geometry from the real sample
 * files without a browser. This reader ignores materials, textures, skins, and
 * animation entirely — it is a geometry path, not a second asset pipeline. The
 * browser still renders through three.js (see `loader.ts`), and both paths
 * produce identical triangles because both bake the same node transforms.
 */

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a; // "JSON"
const CHUNK_BIN = 0x004e4942; // "BIN\0"

const COMPONENT_BYTES: Record<number, number> = {
  5120: 1, // BYTE
  5121: 1, // UNSIGNED_BYTE
  5122: 2, // SHORT
  5123: 2, // UNSIGNED_SHORT
  5125: 4, // UNSIGNED_INT
  5126: 4, // FLOAT
};

const TYPE_COMPONENTS: Record<string, number> = {
  SCALAR: 1,
  VEC2: 2,
  VEC3: 3,
  VEC4: 4,
  MAT2: 4,
  MAT3: 9,
  MAT4: 16,
};

/** Compression extensions this reader deliberately refuses rather than
 * silently mis-decoding into a wrong-shaped collider. */
const UNSUPPORTED_EXTENSIONS = [
  "KHR_draco_mesh_compression",
  "EXT_meshopt_compression",
  "KHR_mesh_quantization",
];

export class GlbParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GlbParseError";
  }
}

interface GltfJson {
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: {
    mesh?: number;
    children?: number[];
    matrix?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
  }[];
  meshes?: {
    primitives: {
      attributes: Record<string, number>;
      indices?: number;
      mode?: number;
    }[];
  }[];
  accessors?: {
    bufferView?: number;
    byteOffset?: number;
    componentType: number;
    count: number;
    type: string;
    normalized?: boolean;
    sparse?: unknown;
  }[];
  bufferViews?: {
    buffer: number;
    byteOffset?: number;
    byteLength: number;
    byteStride?: number;
  }[];
  buffers?: { byteLength: number; uri?: string }[];
  extensionsRequired?: string[];
  extensionsUsed?: string[];
}

export interface GlbContainer {
  readonly json: GltfJson;
  readonly bin: Uint8Array | null;
}

/** Splits a `.glb` into its JSON and binary chunks. */
export function parseGlbContainer(buffer: ArrayBuffer): GlbContainer {
  if (buffer.byteLength < 12) {
    throw new GlbParseError(
      `File is ${buffer.byteLength} bytes, too short to be a GLB header.`,
    );
  }
  const header = new DataView(buffer);
  const magic = header.getUint32(0, true);
  if (magic !== GLB_MAGIC) {
    throw new GlbParseError(
      "Not a binary glTF file (bad magic). Only .glb assets are supported.",
    );
  }
  const version = header.getUint32(4, true);
  if (version !== 2) {
    throw new GlbParseError(`Unsupported GLB version ${version}; expected 2.`);
  }
  const declaredLength = header.getUint32(8, true);
  const totalLength = Math.min(declaredLength, buffer.byteLength);

  let json: GltfJson | null = null;
  let bin: Uint8Array | null = null;
  let offset = 12;
  while (offset + 8 <= totalLength) {
    const chunkLength = header.getUint32(offset, true);
    const chunkType = header.getUint32(offset + 4, true);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkLength;
    if (dataEnd > buffer.byteLength) {
      throw new GlbParseError(
        `GLB chunk at offset ${offset} claims ${chunkLength} bytes but the file ends at ${buffer.byteLength}.`,
      );
    }
    if (chunkType === CHUNK_JSON && json === null) {
      const text = new TextDecoder().decode(
        new Uint8Array(buffer, dataStart, chunkLength),
      );
      json = JSON.parse(text) as GltfJson;
    } else if (chunkType === CHUNK_BIN && bin === null) {
      bin = new Uint8Array(buffer, dataStart, chunkLength);
    }
    // Chunks are already required to be 4-byte aligned by the spec.
    offset = dataEnd;
  }

  if (json === null) {
    throw new GlbParseError("GLB contains no JSON chunk.");
  }
  const required = json.extensionsRequired ?? [];
  const blocking = required.filter((ext) =>
    UNSUPPORTED_EXTENSIONS.includes(ext),
  );
  if (blocking.length > 0) {
    throw new GlbParseError(
      `Asset requires unsupported glTF extension(s): ${blocking.join(", ")}. ` +
        "Geometry cannot be read without silently producing wrong colliders.",
    );
  }
  return { json, bin };
}

function accessorBytes(
  container: GlbContainer,
  accessorIndex: number,
): { data: Float64Array; components: number; count: number } {
  const { json, bin } = container;
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor) {
    throw new GlbParseError(`Missing accessor ${accessorIndex}.`);
  }
  if (accessor.sparse) {
    throw new GlbParseError(
      `Accessor ${accessorIndex} uses sparse storage, which is not supported.`,
    );
  }
  const components = TYPE_COMPONENTS[accessor.type]!;
  if (!components) {
    throw new GlbParseError(`Unknown accessor type "${accessor.type}".`);
  }
  const componentSize = COMPONENT_BYTES[accessor.componentType]!;
  if (!componentSize) {
    throw new GlbParseError(
      `Unknown accessor componentType ${accessor.componentType}.`,
    );
  }
  const out = new Float64Array(accessor.count * components);
  if (accessor.bufferView === undefined) {
    return { data: out, components, count: accessor.count }; // spec: all zeros
  }
  const view = json.bufferViews?.[accessor.bufferView];
  if (!view) {
    throw new GlbParseError(`Missing bufferView ${accessor.bufferView}.`);
  }
  if (view.buffer !== 0 || bin === null) {
    throw new GlbParseError(
      "Only self-contained GLB buffers are supported; external .bin URIs are not.",
    );
  }
  const elementSize = componentSize * components;
  const stride = view.byteStride && view.byteStride > 0 ? view.byteStride : elementSize;
  const base = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const dv = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const lastByte = base + stride * (accessor.count - 1) + elementSize;
  if (accessor.count > 0 && lastByte > bin.byteLength) {
    throw new GlbParseError(
      `Accessor ${accessorIndex} reads past the end of the binary chunk.`,
    );
  }

  for (let i = 0; i < accessor.count; i += 1) {
    const elementOffset = base + i * stride;
    for (let c = 0; c < components; c += 1) {
      const o = elementOffset + c * componentSize;
      let value: number;
      switch (accessor.componentType) {
        case 5120:
          value = dv.getInt8(o);
          break;
        case 5121:
          value = dv.getUint8(o);
          break;
        case 5122:
          value = dv.getInt16(o, true);
          break;
        case 5123:
          value = dv.getUint16(o, true);
          break;
        case 5125:
          value = dv.getUint32(o, true);
          break;
        default:
          value = dv.getFloat32(o, true);
          break;
      }
      out[i * components + c] = value;
    }
  }
  return { data: out, components, count: accessor.count };
}

type Mat4 = Float64Array;

function identityMat4(): Mat4 {
  const m = new Float64Array(16);
  m[0] = 1;
  m[5] = 1;
  m[10] = 1;
  m[15] = 1;
  return m;
}

/** Column-major multiply, matching glTF's matrix layout. */
function multiplyMat4(a: Mat4, b: Mat4): Mat4 {
  const out = new Float64Array(16);
  const left = a;
  const right = b;
  for (let col = 0; col < 4; col += 1) {
    for (let row = 0; row < 4; row += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        sum += left[k * 4 + row]! * right[col * 4 + k]!;
      }
      out[col * 4 + row] = sum;
    }
  }
  return out;
}

function nodeMatrix(node: {
  matrix?: number[];
  translation?: number[];
  rotation?: number[];
  scale?: number[];
}): Mat4 {
  if (node.matrix && node.matrix.length === 16) {
    return Float64Array.from(node.matrix);
  }
  // Read component-wise with defaults: this is external data, and a malformed
  // node with a short TRS array should fall back to identity rather than
  // produce NaNs that silently poison every downstream vertex.
  const translation = node.translation ?? [];
  const rotation = node.rotation ?? [];
  const scaling = node.scale ?? [];
  const tx = translation[0]! ?? 0;
  const ty = translation[1]! ?? 0;
  const tz = translation[2]! ?? 0;
  const qx = rotation[0]! ?? 0;
  const qy = rotation[1]! ?? 0;
  const qz = rotation[2]! ?? 0;
  const qw = rotation[3]! ?? 1;
  const sx = scaling[0]! ?? 1;
  const sy = scaling[1]! ?? 1;
  const sz = scaling[2]! ?? 1;

  const x2 = qx + qx;
  const y2 = qy + qy;
  const z2 = qz + qz;
  const xx = qx * x2;
  const xy = qx * y2;
  const xz = qx * z2;
  const yy = qy * y2;
  const yz = qy * z2;
  const zz = qz * z2;
  const wx = qw * x2;
  const wy = qw * y2;
  const wz = qw * z2;

  const m = new Float64Array(16);
  m[0] = (1 - (yy + zz)) * sx;
  m[1] = (xy + wz) * sx;
  m[2] = (xz - wy) * sx;
  m[3] = 0;
  m[4] = (xy - wz) * sy;
  m[5] = (1 - (xx + zz)) * sy;
  m[6] = (yz + wx) * sy;
  m[7] = 0;
  m[8] = (xz + wy) * sz;
  m[9] = (yz - wx) * sz;
  m[10] = (1 - (xx + yy)) * sz;
  m[11] = 0;
  m[12] = tx;
  m[13] = ty;
  m[14] = tz;
  m[15] = 1;
  return m;
}

/**
 * Extracts every triangle of every mesh primitive reachable from the default
 * scene, with node transforms baked in (asset-local space, glTF's Y-up).
 *
 * Non-triangle primitive modes are skipped rather than approximated — a line
 * or point primitive has no surface to stand on.
 */
export function extractGlbTriangles(buffer: ArrayBuffer): TriangleSoup {
  const container = parseGlbContainer(buffer);
  const { json } = container;
  const sceneIndex = json.scene ?? 0;
  const roots = json.scenes?.[sceneIndex]?.nodes ?? [];

  const chunks: Float32Array[] = [];
  let triangleCount = 0;
  const visited = new Set<number>();

  const visit = (nodeIndex: number, parent: Mat4): void => {
    if (visited.has(nodeIndex)) {
      return; // malformed cyclic graph: read each node once
    }
    visited.add(nodeIndex);
    const node = json.nodes?.[nodeIndex];
    if (!node) return;
    const world = multiplyMat4(parent, nodeMatrix(node));

    if (node.mesh !== undefined) {
      const mesh = json.meshes?.[node.mesh];
      for (const primitive of mesh?.primitives ?? []) {
        const mode = primitive.mode ?? 4;
        if (mode !== 4) continue; // TRIANGLES only
        const positionAccessor = primitive.attributes.POSITION;
        if (positionAccessor === undefined) continue;

        const pos = accessorBytes(container, positionAccessor);
        if (pos.components < 3) continue;

        let indices: ArrayLike<number>;
        if (primitive.indices !== undefined) {
          indices = accessorBytes(container, primitive.indices).data;
        } else {
          const implicit = new Uint32Array(pos.count);
          for (let i = 0; i < pos.count; i += 1) implicit[i] = i;
          indices = implicit;
        }

        const usableTriangles = Math.floor(indices.length / 3);
        const out = new Float32Array(usableTriangles * 9);
        let written = 0;
        for (let t = 0; t < usableTriangles; t += 1) {
          let valid = true;
          for (let v = 0; v < 3; v += 1) {
            const index = indices[t * 3 + v]!;
            if (index >= pos.count) {
              valid = false;
              break;
            }
            const p = index * pos.components;
            const lx = pos.data[p]!;
            const ly = pos.data[p + 1]!;
            const lz = pos.data[p + 2]!;
            const o = written * 9 + v * 3;
            out[o] = world[0]! * lx + world[4]! * ly + world[8]! * lz + world[12]!;
            out[o + 1] = world[1]! * lx + world[5]! * ly + world[9]! * lz + world[13]!;
            out[o + 2] = world[2]! * lx + world[6]! * ly + world[10]! * lz + world[14]!;
          }
          if (valid) written += 1;
        }
        chunks.push(out.subarray(0, written * 9));
        triangleCount += written;
      }
    }

    for (const child of node.children ?? []) {
      visit(child, world);
    }
  };

  for (const root of roots) {
    visit(root, identityMat4());
  }

  const positions = new Float32Array(triangleCount * 9);
  let cursor = 0;
  for (const chunk of chunks) {
    positions.set(chunk, cursor);
    cursor += chunk.length;
  }
  return { positions, triangleCount };
}
