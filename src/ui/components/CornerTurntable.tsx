import { Component, Suspense, useEffect, useMemo, useRef, useState, type ComponentRef, type KeyboardEvent, type ReactNode } from "react";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Box3, CanvasTexture, MathUtils, Spherical, Vector3, type Group } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { turntableSpin, TURNTABLE } from "./turntableMotion.js";

/*
 * The landing's "same corner": the real reconstruction of the desk and sofa
 * from the photo beside it, turning slowly on a turntable. The camera sits
 * straight in front at eye height. Dragging looks around it; a few seconds
 * after you let go it eases back to the front view and the turn picks up
 * again (see turntableMotion.ts).
 *
 * The model is a lighter copy of the bundled sample (public/landing/corner.glb:
 * same geometry, no normals, JPEG texture), drawn with its own baked, unlit
 * material, the way the preview has always shown it. Nothing renders while
 * the card is off screen or the tab is hidden: the parent passes `active`,
 * and the canvas stops its loop.
 */

const MODEL_URL = "/landing/corner.glb";
/** Where the camera rests: in front, a little above the seat, looking down about 17 degrees. */
const HOME = { polar: 1.27, azimuth: 0, distance: 3.35 };
const TARGET = new Vector3(0, 0.3, 0);
/** Which way the model faces at the start, so the first view matches the photo. */
const FRONT_YAW = 0;

interface Motion {
  /** performance.now() of the last drag or key press. */
  lastInput: number;
  dragging: boolean;
  /** Current turn speed, radians per second. */
  spin: number;
  /** Turn from the keyboard, applied on the next frame. */
  nudge: number;
}

/** A soft plum pool, darkest in the middle, for the floor under the model. */
function useShadowTexture(): CanvasTexture {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const g = canvas.getContext("2d")!;
    const gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(36, 20, 61, .34)");
    gradient.addColorStop(0.55, "rgba(36, 20, 61, .16)");
    gradient.addColorStop(1, "rgba(36, 20, 61, 0)");
    g.fillStyle = gradient;
    g.fillRect(0, 0, 128, 128);
    return new CanvasTexture(canvas);
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function Corner({ onReady }: { onReady: () => void }) {
  const gltf = useLoader(GLTFLoader, MODEL_URL);
  const shadow = useShadowTexture();
  // Stand the model on the floor (y = 0), centred on its turning axis, and
  // measure its footprint for the shadow.
  const { scene, footprint } = useMemo(() => {
    const copy = gltf.scene.clone(true);
    const box = new Box3().setFromObject(copy);
    const centre = box.getCenter(new Vector3());
    const size = box.getSize(new Vector3());
    copy.position.set(-centre.x, -box.min.y, -centre.z);
    const footprint: [number, number] = [size.x * 1.15, size.z * 1.9];
    return { scene: copy, footprint };
  }, [gltf.scene]);
  useEffect(onReady, [onReady]);
  return (
    <>
      <primitive object={scene} />
      {/* A contact shadow sized to the footprint. It lives inside the turning
          group, so it turns with the furniture and never needs redrawing. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.001, 0]} renderOrder={-1}>
        <planeGeometry args={footprint} />
        <meshBasicMaterial map={shadow} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  );
}

function Stage({ motion, reducedMotion, onReady }: { motion: Motion; reducedMotion: boolean; onReady: () => void }) {
  const turntable = useRef<Group>(null);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const camera = useThree((state) => state.camera);
  const spherical = useMemo(() => new Spherical(), []);
  const offset = useMemo(() => new Vector3(), []);

  useFrame((_, delta) => {
    const group = turntable.current;
    if (!group) return;
    const dt = Math.min(delta, 0.1);
    const { spin, settle } = turntableSpin({
      now: performance.now(), lastInput: motion.lastInput, dragging: motion.dragging, reducedMotion, spin: motion.spin, dt,
    });
    motion.spin = spin;
    group.rotation.y += spin * dt + motion.nudge;
    motion.nudge = 0;
    if (!settle) return;
    // Ease the view back to the front, at eye height, by the shortest way round.
    offset.copy(camera.position).sub(TARGET);
    spherical.setFromVector3(offset);
    const turn = MathUtils.euclideanModulo(HOME.azimuth - spherical.theta + Math.PI, Math.PI * 2) - Math.PI;
    spherical.theta += turn * (1 - Math.exp(-TURNTABLE.settleRate * dt));
    spherical.phi = MathUtils.damp(spherical.phi, HOME.polar, TURNTABLE.settleRate, dt);
    spherical.radius = HOME.distance;
    camera.position.setFromSpherical(spherical).add(TARGET);
    camera.lookAt(TARGET);
  });

  return (
    <>
      <group ref={turntable} rotation={[0, FRONT_YAW, 0]}>
        <Suspense fallback={null}><Corner onReady={onReady} /></Suspense>
      </group>
      <OrbitControls
        ref={controls}
        target={TARGET}
        enablePan={false}
        enableZoom={false}
        enableDamping={!reducedMotion}
        dampingFactor={0.08}
        rotateSpeed={0.6}
        minPolarAngle={0.75}
        maxPolarAngle={1.48}
        onStart={() => { motion.dragging = true; motion.lastInput = performance.now(); }}
        onEnd={() => { motion.dragging = false; motion.lastInput = performance.now(); }}
      />
    </>
  );
}

/** Invalidates on demand-rendered frames when the keyboard turns the model. */
function KeyRedraw({ onInvalidate }: { onInvalidate: (fn: () => void) => void }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => onInvalidate(invalidate), [invalidate, onInvalidate]);
  return null;
}

class TurntableBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  // The parent keeps showing its still picture, so a failure needs no copy here.
  override render() { return this.state.failed ? null : this.props.children; }
}

function usePrefersReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => typeof matchMedia === "function" && matchMedia(query).matches);
  useEffect(() => {
    if (typeof matchMedia !== "function") return;
    const list = matchMedia(query);
    const onChange = () => setReduced(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export default function CornerTurntable({ active, onReady }: { active: boolean; onReady: () => void }) {
  const reducedMotion = usePrefersReducedMotion();
  const motion = useRef<Motion>({ lastInput: -Infinity, dragging: false, spin: 0, nudge: 0 }).current;
  const redraw = useRef<() => void>(() => undefined);
  const onInvalidate = useMemo(() => (fn: () => void) => { redraw.current = fn; }, []);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowLeft" ? -TURNTABLE.keyStep : event.key === "ArrowRight" ? TURNTABLE.keyStep : 0;
    if (!step) return;
    event.preventDefault();
    motion.nudge += step;
    motion.lastInput = performance.now();
    redraw.current();
  }

  return (
    <TurntableBoundary>
      <div
        className="wk-turntable"
        tabIndex={0}
        role="img"
        aria-roledescription="3D view"
        aria-label="3D view of the rebuilt desk and sofa. Drag, or use the left and right arrow keys, to turn it."
        onKeyDown={onKeyDown}
      >
        <Canvas
          flat
          frameloop={!active ? "never" : reducedMotion ? "demand" : "always"}
          dpr={[1, 1.5]}
          camera={{ position: [0, TARGET.y + HOME.distance * Math.cos(HOME.polar), HOME.distance * Math.sin(HOME.polar)], fov: 32, near: 0.1, far: 50 }}
          gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
          fallback={null}
        >
          <Stage motion={motion} reducedMotion={reducedMotion} onReady={onReady} />
          <KeyRedraw onInvalidate={onInvalidate} />
        </Canvas>
      </div>
    </TurntableBoundary>
  );
}
