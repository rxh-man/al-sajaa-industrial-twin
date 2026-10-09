import { useEffect, useRef, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { HalfFloatType, WebGLRenderTarget, type Group, type Object3D } from 'three';
import { SceneEnvironment } from './SceneEnvironment';
import { SimulationDriver } from './SimulationDriver';
import { CameraRig } from './CameraRig';
import { Ground, Diorama } from './Ground';
import { AbuDhabiBuildings } from './AbuDhabiBuildings';
import { Mosques } from './Mosques';
import { Palms } from './Palms';
import { StreetLights } from './StreetLights';
import { MapLabels } from './MapLabels';
import { Sea } from './Sea';
import { AbuDhabiTraffic } from './AbuDhabiTraffic';
import { ElevatedRoads } from './ElevatedRoads';
import { Cutaway, TrenchVolume } from './Cutaway';
import { SurfaceMarkers } from './SensorNodes';
import { Correlation } from './Correlation';
import { ImpactZone } from './ImpactZone';
import { RepairRoute } from './RepairRoute';
import { SectorOverlay } from './SectorOverlay';
import { UndergroundNetwork, SurfaceLabel } from './UndergroundNetwork';
import { InspectorCard } from './InspectorCard';
import { Effects } from './Effects';
import { PerfProbe } from './PerfProbe';
import { DevHooks } from './DevHooks';
import { G } from './shaders/globals';
import { useTwinStore } from '../store/useTwinStore';

/** Everything above ground; lifts away as a single plate in the exploded view. */
function SurfaceGroup({ children }: { children: ReactNode }) {
  const ref = useRef<Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.position.y = G.uExploded.value * 12;
  });
  return <group ref={ref}>{children}</group>;
}

/**
 * Compiles every material (including currently hidden ones) in parallel via
 * KHR_parallel_shader_compile before the first real frame, so the demo never
 * hitches when X-ray, the cutaway or the repair visuals first appear.
 * Rendering is gated (a priority-1 frame subscriber) until compilation finishes.
 */
function Warmup() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const ready = useTwinStore((s) => s.sceneReady);
  const setSceneReady = useTwinStore((s) => s.setSceneReady);
  useFrame(() => {}, ready ? 0 : 1);
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      await new Promise((r) => setTimeout(r, 30));
      const hidden: Object3D[] = [];
      scene.traverse((o) => {
        if (!o.visible) {
          hidden.push(o);
          o.visible = true;
        }
      });
      // Compile the same variants the post-processing path will use: rendering into an
      // offscreen target means linear output and no renderer tone mapping.
      const rt = new WebGLRenderTarget(8, 8, { type: HalfFloatType });
      const prev = gl.getRenderTarget();
      try {
        gl.setRenderTarget(rt);
        const pending = gl.compileAsync(scene, camera);
        gl.setRenderTarget(prev);
        await pending;
        // one offscreen render compiles the remaining shadow/depth variants and uploads buffers
        gl.setRenderTarget(rt);
        gl.render(scene, camera);
      } catch (err) {
        console.warn('[twin] shader warm-up failed', err);
      } finally {
        gl.setRenderTarget(prev);
        rt.dispose();
        hidden.forEach((o) => (o.visible = false));
      }
      if (!cancelled) setSceneReady();
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [gl, scene, camera, setSceneReady]);
  return null;
}

function EffectsGate({ quality }: { quality: 'high' | 'low' }) {
  const ready = useTwinStore((s) => s.sceneReady);
  return ready ? <Effects quality={quality} /> : null;
}

export function CityScene({ quality }: { quality: 'high' | 'low' }) {
  return (
    <>
      <SimulationDriver />
      <SceneEnvironment />
      <CameraRig />
      <SurfaceGroup>
        <Ground />
        <Sea />
        <AbuDhabiBuildings />
        <Mosques />
        <Palms />
        <StreetLights />
        <MapLabels />
        <AbuDhabiTraffic />
        <ElevatedRoads />
        <Cutaway />
        <SurfaceMarkers />
        <Correlation />
        <ImpactZone />
        <RepairRoute />
        <SectorOverlay />
        <SurfaceLabel />
      </SurfaceGroup>
      <Diorama />
      <TrenchVolume />
      <UndergroundNetwork />
      <InspectorCard />
      <Warmup />
      {import.meta.env.DEV && <PerfProbe />}
      {import.meta.env.DEV && <DevHooks />}
      <EffectsGate quality={quality} />
    </>
  );
}
