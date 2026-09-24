/**
 * "Pip" — the authored player character.
 *
 * PROVENANCE
 * ----------
 * Original design, authored by hand in this file as data. No third-party mesh,
 * no scanned or generated asset, no borrowed brand art, no paid provider call.
 * The runtime builds one continuous skinned surface from the swept profiles
 * below (`characterGeometry.ts`) over the bone table below (`characterRig.ts`),
 * so the character reads as a single sculpted form rather than a pile of
 * primitives. Keeping the design as data — instead of a binary in
 * `public/character/` — means it is diffable, testable, and scales exactly with
 * the movement config.
 *
 * DESIGN INTENT
 * -------------
 * A tiny wind-up explorer doll: knitted cap over a big rounded head, goggles
 * pushed up on the brow, a padded one-piece suit pinched at the waist, chunky
 * mittens and boots, a trailing scarf for secondary motion, and a lantern on
 * the back so the silhouette stays findable in the shadow under furniture.
 * Chibi proportions (head ≈ 30 % of total height) read clearly when the
 * character is a few centimetres tall against an eight-metre sofa.
 *
 * COORDINATE CONVENTION
 * ---------------------
 * Every number here is in NORMALIZED CHARACTER UNITS: total standing height is
 * exactly 1, the origin is the physics capsule's centre, the soles sit at
 * y = -0.5 and the crown at y ≈ +0.48. `+Z` is the character's facing
 * direction and `+X` is its own left (see `headingRight` in `core/vec.ts`).
 * `PlayerAvatar` scales the whole rig by the capsule's total height, so the
 * design follows `MovementConfig` automatically and nothing has to be retuned
 * when the character's scale changes.
 */

/** Soles at -0.5, crown at ~+0.48: one unit tall, centred on the capsule. */
export const CHARACTER_UNIT_HEIGHT = 1;

/**
 * Half-width of the capsule in the same normalized units, for the default
 * tuning. Every authored radius below stays inside this so the visible body
 * never pokes through its own collider.
 */
export const CHARACTER_UNIT_HALF_WIDTH = 0.2571;

export interface BoneDefinition {
  readonly name: string;
  readonly parent: string | null;
  /** Rest position in world-ish character space, not parent-local: the rig
   * builder derives local offsets so this table stays readable. */
  readonly rest: readonly [number, number, number];
}

/**
 * Rest skeleton. Bones carry no rest rotation, so a bone's local +Y always
 * points "up" in character space and a limb hangs along -Y. That makes the
 * animation channels mean the same thing on every bone: `rotation.x` swings a
 * limb fore/aft, `rotation.z` swings it in/out, `rotation.y` twists it.
 */
export const BONES: readonly BoneDefinition[] = [
  { name: "root", parent: null, rest: [0, 0, 0] },
  { name: "hips", parent: "root", rest: [0, -0.16, 0] },
  { name: "spine", parent: "hips", rest: [0, -0.05, 0] },
  { name: "chest", parent: "spine", rest: [0, 0.06, 0] },
  { name: "neck", parent: "chest", rest: [0, 0.17, 0] },
  { name: "head", parent: "neck", rest: [0, 0.22, 0] },

  { name: "shoulder.L", parent: "chest", rest: [0.135, 0.125, 0] },
  { name: "elbow.L", parent: "shoulder.L", rest: [0.165, -0.02, 0] },
  { name: "wrist.L", parent: "elbow.L", rest: [0.18, -0.145, 0] },
  { name: "shoulder.R", parent: "chest", rest: [-0.135, 0.125, 0] },
  { name: "elbow.R", parent: "shoulder.R", rest: [-0.165, -0.02, 0] },
  { name: "wrist.R", parent: "elbow.R", rest: [-0.18, -0.145, 0] },

  { name: "hip.L", parent: "hips", rest: [0.068, -0.175, 0] },
  { name: "knee.L", parent: "hip.L", rest: [0.072, -0.315, 0] },
  { name: "ankle.L", parent: "knee.L", rest: [0.074, -0.445, 0] },
  { name: "hip.R", parent: "hips", rest: [-0.068, -0.175, 0] },
  { name: "knee.R", parent: "hip.R", rest: [-0.072, -0.315, 0] },
  { name: "ankle.R", parent: "knee.R", rest: [-0.074, -0.445, 0] },

  { name: "scarf.1", parent: "neck", rest: [0, 0.15, -0.035] },
  { name: "scarf.2", parent: "scarf.1", rest: [0, 0.075, -0.1] },
  { name: "scarf.3", parent: "scarf.2", rest: [0, -0.005, -0.15] },
];

export type BoneName = (typeof BONES)[number]["name"];

/** Material zones. Colour comes from vertex colours so the whole body is one
 * draw call with no seam between "materials". */
export const ZONE = {
  suit: "suit",
  suitDark: "suitDark",
  cap: "cap",
  skin: "skin",
  mitten: "mitten",
  boot: "boot",
  scarf: "scarf",
  goggles: "goggles",
  lantern: "lantern",
} as const;

export type ZoneName = (typeof ZONE)[keyof typeof ZONE];

/**
 * Palette. Chosen for value contrast rather than hue variety: the cap, scarf
 * and mittens are light, the suit and boots are dark, so the silhouette still
 * separates into readable shapes when the character is only a few pixels tall
 * or is lit from behind.
 */
export const PALETTE: Record<ZoneName, string> = {
  suit: "#f0743c",
  suitDark: "#c44f27",
  cap: "#ffeede",
  skin: "#ffd8b8",
  mitten: "#fff3e3",
  boot: "#3b3350",
  scarf: "#63e0d8",
  goggles: "#2b2438",
  lantern: "#8ff8ff",
};

/** Emissive accent used by the lantern and its light. */
export const LANTERN_COLOUR = PALETTE.lantern;

export interface RingWeight {
  readonly bone: string;
  readonly weight: number;
}

export interface Ring {
  /** Ring centre in normalized character space. */
  readonly at: readonly [number, number, number];
  /** Cross-section half-extent across the sweep's local X. */
  readonly rx: number;
  /** Cross-section half-extent along the sweep's local Z. 0 ⇒ same as rx. */
  readonly rz?: number;
  /**
   * Cross-section squareness. 1 is an ellipse; above 1 flattens the sides
   * toward a rounded rectangle, which is what gives the boots and the padded
   * chest their toy-like, slightly boxy read without any hard primitive edge.
   */
  readonly squareness?: number;
  /** Shift of this ring's cross-section along local Z, for a chest that
   * bulges forward or a boot that leans over its toe. */
  readonly offsetZ?: number;
  readonly zone: ZoneName;
  readonly weights: readonly RingWeight[];
}

export type CapKind = "open" | "pole";

export interface PartDefinition {
  readonly name: string;
  /** Number of vertices around each ring. */
  readonly sides: number;
  /** How the first/last ring is closed off. */
  readonly startCap: CapKind;
  readonly endCap: CapKind;
  /**
   * Cylindrical UVs mapped into the face atlas' art region instead of its flat
   * white corner. Only the head uses this.
   */
  readonly faceMapped?: boolean;
  /**
   * Rings are swept along the polyline through their centres, with each
   * cross-section perpendicular to the local tangent. Rings must be ordered.
   */
  readonly rings: readonly Ring[];
}

const W = (bone: string, weight = 1): RingWeight => ({ bone, weight });

/**
 * Torso: hips → pinched waist → padded chest → tapered neck, as one sweep.
 * The pinch is what stops the body reading as a capsule.
 */
const TORSO: PartDefinition = {
  name: "torso",
  sides: 16,
  startCap: "pole",
  endCap: "open",
  rings: [
    { at: [0, -0.225, 0], rx: 0.05, rz: 0.046, zone: ZONE.suitDark, weights: [W("hips")] },
    { at: [0, -0.205, 0], rx: 0.104, rz: 0.09, squareness: 1.25, zone: ZONE.suitDark, weights: [W("hips")] },
    { at: [0, -0.175, 0], rx: 0.14, rz: 0.116, squareness: 1.3, zone: ZONE.suitDark, weights: [W("hips")] },
    { at: [0, -0.13, 0], rx: 0.132, rz: 0.108, squareness: 1.2, zone: ZONE.suitDark, weights: [W("hips", 0.6), W("spine", 0.4)] },
    { at: [0, -0.075, 0], rx: 0.116, rz: 0.097, squareness: 1.1, zone: ZONE.suit, weights: [W("hips", 0.25), W("spine", 0.75)] },
    { at: [0, -0.02, 0], rx: 0.128, rz: 0.11, offsetZ: 0.004, squareness: 1.15, zone: ZONE.suit, weights: [W("spine", 0.7), W("chest", 0.3)] },
    { at: [0, 0.035, 0], rx: 0.148, rz: 0.126, offsetZ: 0.008, squareness: 1.25, zone: ZONE.suit, weights: [W("spine", 0.25), W("chest", 0.75)] },
    { at: [0, 0.09, 0], rx: 0.154, rz: 0.126, offsetZ: 0.006, squareness: 1.3, zone: ZONE.suit, weights: [W("chest")] },
    { at: [0, 0.128, 0], rx: 0.14, rz: 0.114, squareness: 1.2, zone: ZONE.suit, weights: [W("chest")] },
    { at: [0, 0.155, 0], rx: 0.104, rz: 0.09, zone: ZONE.suit, weights: [W("chest", 0.55), W("neck", 0.45)] },
    { at: [0, 0.175, 0], rx: 0.07, rz: 0.066, zone: ZONE.skin, weights: [W("neck")] },
    { at: [0, 0.2, 0], rx: 0.062, rz: 0.06, zone: ZONE.skin, weights: [W("neck", 0.55), W("head", 0.45)] },
    { at: [0, 0.225, 0], rx: 0.07, rz: 0.068, zone: ZONE.skin, weights: [W("head")] },
  ],
};

/**
 * Head: an egg that overlaps the torso's neck so the join is inside the
 * surface, with the knitted cap growing out of the same sweep rather than
 * being a separate hat sitting on top.
 */
const HEAD: PartDefinition = {
  name: "head",
  sides: 20,
  startCap: "open",
  endCap: "pole",
  faceMapped: true,
  rings: [
    { at: [0, 0.205, 0], rx: 0.066, rz: 0.064, zone: ZONE.skin, weights: [W("head")] },
    { at: [0, 0.235, 0], rx: 0.112, rz: 0.108, zone: ZONE.skin, weights: [W("head")] },
    { at: [0, 0.268, 0], rx: 0.143, rz: 0.139, offsetZ: 0.004, zone: ZONE.skin, weights: [W("head")] },
    { at: [0, 0.3, 0], rx: 0.158, rz: 0.153, offsetZ: 0.006, zone: ZONE.skin, weights: [W("head")] },
    { at: [0, 0.335, 0], rx: 0.164, rz: 0.158, offsetZ: 0.006, zone: ZONE.skin, weights: [W("head")] },
    { at: [0, 0.362, 0], rx: 0.162, rz: 0.156, offsetZ: 0.004, zone: ZONE.skin, weights: [W("head")] },
    // The cap's brim: a slight flare, so it reads as a knitted band.
    { at: [0, 0.378, 0], rx: 0.166, rz: 0.16, zone: ZONE.cap, weights: [W("head")] },
    { at: [0, 0.4, 0], rx: 0.156, rz: 0.151, zone: ZONE.cap, weights: [W("head")] },
    { at: [0, 0.428, 0], rx: 0.132, rz: 0.128, zone: ZONE.cap, weights: [W("head")] },
    { at: [0, 0.453, 0], rx: 0.098, rz: 0.095, zone: ZONE.cap, weights: [W("head")] },
    { at: [0, 0.47, 0], rx: 0.058, rz: 0.056, zone: ZONE.cap, weights: [W("head")] },
    { at: [0, 0.481, 0], rx: 0.026, rz: 0.025, zone: ZONE.cap, weights: [W("head")] },
  ],
};

/** Goggles pushed up onto the cap's brim. A band, not a pair of discs. */
const GOGGLES: PartDefinition = {
  name: "goggles",
  sides: 20,
  startCap: "open",
  endCap: "open",
  rings: [
    { at: [0, 0.362, 0], rx: 0.168, rz: 0.162, zone: ZONE.goggles, weights: [W("head")] },
    { at: [0, 0.376, 0], rx: 0.172, rz: 0.166, zone: ZONE.goggles, weights: [W("head")] },
    { at: [0, 0.39, 0], rx: 0.168, rz: 0.162, zone: ZONE.goggles, weights: [W("head")] },
  ],
};

/** Cloth collar flaring out under the chin; hides the neck join completely. */
const COLLAR: PartDefinition = {
  name: "collar",
  sides: 16,
  startCap: "open",
  endCap: "open",
  rings: [
    { at: [0, 0.142, 0], rx: 0.112, rz: 0.098, squareness: 1.1, zone: ZONE.scarf, weights: [W("chest", 0.4), W("neck", 0.6)] },
    { at: [0, 0.168, 0], rx: 0.122, rz: 0.108, squareness: 1.1, zone: ZONE.scarf, weights: [W("neck")] },
    { at: [0, 0.185, 0], rx: 0.1, rz: 0.09, zone: ZONE.scarf, weights: [W("neck")] },
  ],
};

function arm(side: 1 | -1, suffix: "L" | "R"): PartDefinition {
  const x = (v: number) => v * side;
  return {
    name: `arm.${suffix}`,
    sides: 12,
    startCap: "pole",
    endCap: "pole",
    rings: [
      // Buried inside the chest, so the shoulder has no visible seam.
      { at: [x(0.09), 0.138, 0], rx: 0.052, rz: 0.052, zone: ZONE.suit, weights: [W("chest")] },
      { at: [x(0.118), 0.132, 0], rx: 0.06, rz: 0.06, zone: ZONE.suit, weights: [W("chest", 0.4), W(`shoulder.${suffix}`, 0.6)] },
      { at: [x(0.142), 0.108, 0], rx: 0.055, rz: 0.055, zone: ZONE.suit, weights: [W(`shoulder.${suffix}`)] },
      { at: [x(0.155), 0.05, 0], rx: 0.047, rz: 0.047, zone: ZONE.suit, weights: [W(`shoulder.${suffix}`)] },
      { at: [x(0.163), -0.005, 0], rx: 0.042, rz: 0.042, zone: ZONE.suit, weights: [W(`shoulder.${suffix}`, 0.5), W(`elbow.${suffix}`, 0.5)] },
      { at: [x(0.17), -0.06, 0], rx: 0.038, rz: 0.038, zone: ZONE.suitDark, weights: [W(`elbow.${suffix}`)] },
      { at: [x(0.177), -0.118, 0], rx: 0.036, rz: 0.036, zone: ZONE.suitDark, weights: [W(`elbow.${suffix}`, 0.55), W(`wrist.${suffix}`, 0.45)] },
      // Mitten: bulges out past the cuff, tapers to a rounded tip.
      { at: [x(0.18), -0.15, 0.002], rx: 0.049, rz: 0.046, squareness: 1.2, zone: ZONE.mitten, weights: [W(`wrist.${suffix}`)] },
      { at: [x(0.181), -0.182, 0.006], rx: 0.05, rz: 0.047, squareness: 1.2, zone: ZONE.mitten, weights: [W(`wrist.${suffix}`)] },
      { at: [x(0.181), -0.208, 0.008], rx: 0.038, rz: 0.036, zone: ZONE.mitten, weights: [W(`wrist.${suffix}`)] },
    ],
  };
}

function leg(side: 1 | -1, suffix: "L" | "R"): PartDefinition {
  const x = (v: number) => v * side;
  return {
    name: `leg.${suffix}`,
    sides: 12,
    startCap: "pole",
    endCap: "pole",
    rings: [
      // Buried inside the hips.
      { at: [x(0.058), -0.125, 0], rx: 0.07, rz: 0.07, zone: ZONE.suitDark, weights: [W("hips")] },
      { at: [x(0.064), -0.16, 0], rx: 0.076, rz: 0.076, zone: ZONE.suitDark, weights: [W("hips", 0.45), W(`hip.${suffix}`, 0.55)] },
      { at: [x(0.069), -0.212, 0], rx: 0.069, rz: 0.069, zone: ZONE.suitDark, weights: [W(`hip.${suffix}`)] },
      { at: [x(0.071), -0.268, 0], rx: 0.061, rz: 0.061, zone: ZONE.suitDark, weights: [W(`hip.${suffix}`, 0.65), W(`knee.${suffix}`, 0.35)] },
      { at: [x(0.072), -0.315, 0], rx: 0.056, rz: 0.056, zone: ZONE.suitDark, weights: [W(`hip.${suffix}`, 0.3), W(`knee.${suffix}`, 0.7)] },
      { at: [x(0.073), -0.372, 0], rx: 0.052, rz: 0.052, zone: ZONE.suitDark, weights: [W(`knee.${suffix}`)] },
      // Boot. The sweep stays vertical and the foot is lengthened by growing
      // the section's depth and pushing it forward, rather than by steering
      // the sweep out along +Z: a near-horizontal sweep would tip the
      // cross-section frame on its side and drop the sole through the bottom
      // of the collider.
      { at: [x(0.074), -0.415, 0], rx: 0.062, rz: 0.062, squareness: 1.25, offsetZ: 0.004, zone: ZONE.boot, weights: [W(`knee.${suffix}`, 0.4), W(`ankle.${suffix}`, 0.6)] },
      { at: [x(0.074), -0.45, 0], rx: 0.062, rz: 0.072, squareness: 1.4, offsetZ: 0.012, zone: ZONE.boot, weights: [W(`ankle.${suffix}`)] },
      { at: [x(0.074), -0.475, 0], rx: 0.058, rz: 0.082, squareness: 1.5, offsetZ: 0.024, zone: ZONE.boot, weights: [W(`ankle.${suffix}`)] },
      { at: [x(0.074), -0.489, 0], rx: 0.045, rz: 0.072, squareness: 1.45, offsetZ: 0.03, zone: ZONE.boot, weights: [W(`ankle.${suffix}`)] },
      { at: [x(0.074), -0.4945, 0], rx: 0.024, rz: 0.044, squareness: 1.25, offsetZ: 0.032, zone: ZONE.boot, weights: [W(`ankle.${suffix}`)] },
    ],
  };
}

/** Scarf tail: a flattened ribbon, driven entirely by the secondary-motion
 * springs on `scarf.1..3`. */
const SCARF: PartDefinition = {
  name: "scarf",
  sides: 8,
  startCap: "pole",
  endCap: "pole",
  rings: [
    { at: [0, 0.165, -0.04], rx: 0.055, rz: 0.03, squareness: 1.6, zone: ZONE.scarf, weights: [W("neck")] },
    { at: [0, 0.15, -0.075], rx: 0.062, rz: 0.022, squareness: 1.8, zone: ZONE.scarf, weights: [W("neck", 0.35), W("scarf.1", 0.65)] },
    { at: [0, 0.115, -0.11], rx: 0.058, rz: 0.019, squareness: 1.8, zone: ZONE.scarf, weights: [W("scarf.1")] },
    { at: [0, 0.07, -0.14], rx: 0.053, rz: 0.017, squareness: 1.8, zone: ZONE.scarf, weights: [W("scarf.1", 0.4), W("scarf.2", 0.6)] },
    { at: [0, 0.02, -0.162], rx: 0.048, rz: 0.016, squareness: 1.8, zone: ZONE.scarf, weights: [W("scarf.2")] },
    { at: [0, -0.03, -0.178], rx: 0.042, rz: 0.015, squareness: 1.8, zone: ZONE.scarf, weights: [W("scarf.2", 0.4), W("scarf.3", 0.6)] },
    { at: [0, -0.08, -0.19], rx: 0.036, rz: 0.014, squareness: 1.8, zone: ZONE.scarf, weights: [W("scarf.3")] },
    { at: [0, -0.12, -0.198], rx: 0.026, rz: 0.012, zone: ZONE.scarf, weights: [W("scarf.3")] },
  ],
};

/** Lantern housing on the back. The emissive lens is a separate small mesh so
 * it can pulse without touching the body material. */
const LANTERN_HOUSING: PartDefinition = {
  name: "lantern",
  sides: 10,
  startCap: "pole",
  endCap: "pole",
  rings: [
    { at: [0, 0.05, -0.11], rx: 0.03, rz: 0.02, zone: ZONE.boot, weights: [W("chest")] },
    { at: [0, 0.055, -0.135], rx: 0.045, rz: 0.035, squareness: 1.4, zone: ZONE.boot, weights: [W("chest")] },
    { at: [0, 0.055, -0.162], rx: 0.042, rz: 0.032, squareness: 1.4, zone: ZONE.boot, weights: [W("chest")] },
    { at: [0, 0.052, -0.176], rx: 0.026, rz: 0.02, zone: ZONE.boot, weights: [W("chest")] },
  ],
};

export const CHARACTER_PARTS: readonly PartDefinition[] = [
  TORSO,
  HEAD,
  GOGGLES,
  COLLAR,
  arm(1, "L"),
  arm(-1, "R"),
  leg(1, "L"),
  leg(-1, "R"),
  SCARF,
  LANTERN_HOUSING,
];

/** Where the emissive lantern lens sits, and how big, in normalized units. */
export const LANTERN_LENS = {
  bone: "chest",
  at: [0, 0.055, -0.18] as const,
  radius: 0.026,
};

/**
 * Outline shell thickness as a fraction of total height. A back-face hull this
 * thin is invisible as geometry but gives the silhouette a dark contour, which
 * is the single biggest readability win for a character this small against
 * cluttered furniture.
 */
export const OUTLINE_THICKNESS = 0.008;
export const OUTLINE_COLOUR = "#241d33";
