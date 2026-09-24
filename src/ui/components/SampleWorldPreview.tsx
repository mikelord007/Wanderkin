import { Component, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { Bounds, Center } from "@react-three/drei";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

function SampleObject({ onReady }: { onReady: () => void }) {
  const asset = useLoader(GLTFLoader, "/samples/rodin.glb");
  const scene = useMemo(() => asset.scene.clone(true), [asset.scene]);
  useEffect(onReady, [onReady]);
  return <Bounds fit clip observe margin={1.25} maxDuration={0}><Center><primitive object={scene} /></Center></Bounds>;
}
class PreviewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  override render() {
    return this.state.failed ? <p className="oq-welcome__preview-status">The 3D preview couldn’t load. You can still try the sample below.</p> : this.props.children;
  }
}
/** Actual bundled geometry, static camera, demand rendering. No fabricated transformation. */
export default function SampleWorldPreview() {
  const [ready, setReady] = useState(false);
  const onReady = useMemo(() => () => setReady(true), []);
  return <PreviewBoundary><div className="oq-welcome__model" role="img" aria-label="Actual 3D reconstruction of the desk and sofa used in the bundled playable sample">
    {!ready && <p className="oq-welcome__preview-status" role="status">Opening the little world…</p>}
    <Canvas frameloop="demand" dpr={[1, 1.5]} camera={{ position: [3, 2.4, 3.8], fov: 38 }}
      gl={{ antialias: true, alpha: true }} fallback={<p className="oq-welcome__preview-status">3D preview unavailable on this device.</p>}>
      <ambientLight intensity={1.8} /><directionalLight position={[3, 5, 4]} intensity={2.5} />
      <Suspense fallback={null}><SampleObject onReady={onReady} /></Suspense>
    </Canvas>
  </div></PreviewBoundary>;
}
