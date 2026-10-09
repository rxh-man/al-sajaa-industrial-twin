import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  CylinderGeometry,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Raycaster,
  type Intersection,
  type Matrix4,
} from 'three';
import type { Network } from '../../data/networks';
import { INCIDENT_SEGMENT_ID } from '../../data/networks';
import { live } from '../../simulation/runtime';
import { useTwinStore } from '../../store/useTwinStore';
import { buildNetworkGeometry, ELBOW_RATIO, type PipeInstance } from './buildNetworkGeometry';
import { createFittingMaterial, createGlassShellMaterial, createPipeMaterial, createPipeUniforms } from '../materials/pipeMaterials';
import { G } from '../shaders/globals';

const noRaycast = (_r: Raycaster, _i: Intersection[]) => {};
const RED = new Color('#ff4434');
const AMBER = new Color('#ffb02e');
const tmp = new Color();

export function undergroundInteractive() {
  return live.xray > 0.5 || live.trench > 0.5 || live.exploded > 0.5;
}

function useInstances(ref: React.RefObject<InstancedMesh | null>, matrices: Matrix4[]) {
  useLayoutEffect(() => {
    const m = ref.current;
    if (!m) return;
    matrices.forEach((mat, i) => m.setMatrixAt(i, mat));
    m.count = matrices.length;
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [ref, matrices]);
}

export function NetworkLayer({ network }: { network: Network }) {
  const built = useMemo(() => buildNetworkGeometry(network), [network]);
  const uniforms = useMemo(() => createPipeUniforms(network.layer, network.variant), [network]);
  const pipeMat = useMemo(() => createPipeMaterial(uniforms), [uniforms]);
  const fitMat = useMemo(() => createFittingMaterial(uniforms, 0.86), [uniforms]);
  const flangeMat = useMemo(() => createFittingMaterial(uniforms, 1.15), [uniforms]);
  const layerId = network.layer.id;
  const isWater = layerId === 'water';
  const leakIdx = useMemo(() => (isWater ? network.segments.findIndex((s) => s.id === INCIDENT_SEGMENT_ID) : -1), [isWater, network]);

  const pipeGeo = useMemo(() => {
    const g = new CylinderGeometry(1, 1, 1, 18, 1, false);
    const n = built.pipes.length;
    const aSeg = new Float32Array(n);
    const aFlow = new Float32Array(n);
    const aFlowIso = new Float32Array(n);
    const aReroute = new Float32Array(n);
    built.pipes.forEach((p, i) => {
      aSeg[i] = p.seg;
      aFlow[i] = p.flow;
      aFlowIso[i] = p.flowIso;
      aReroute[i] = p.reroute;
    });
    g.setAttribute('aSeg', new InstancedBufferAttribute(aSeg, 1));
    g.setAttribute('aFlow', new InstancedBufferAttribute(aFlow, 1));
    g.setAttribute('aFlowIso', new InstancedBufferAttribute(aFlowIso, 1));
    g.setAttribute('aReroute', new InstancedBufferAttribute(aReroute, 1));
    return g;
  }, [built]);
  const elbowGeo = useMemo(() => new TorusGeometry(ELBOW_RATIO, 1, 12, 16, Math.PI / 2), []);
  const hubGeo = useMemo(() => new SphereGeometry(1, 18, 12), []);
  const cylGeo = useMemo(() => new CylinderGeometry(1, 1, 1, 18, 1, false), []);

  const pipesRef = useRef<InstancedMesh>(null);
  const elbowsRef = useRef<InstancedMesh>(null);
  const hubsRef = useRef<InstancedMesh>(null);
  const flangesRef = useRef<InstancedMesh>(null);
  const risersRef = useRef<InstancedMesh>(null);

  const pipeMatrices = useMemo(() => built.pipes.map((p) => p.matrix), [built]);
  useInstances(pipesRef, pipeMatrices);
  useInstances(elbowsRef, built.elbows);
  useInstances(hubsRef, built.hubs);
  useInstances(flangesRef, built.flanges);
  useInstances(risersRef, built.risers);

  const setHover = useTwinStore((s) => s.setHover);
  const select = useTwinStore((s) => s.select);

  useFrame(() => {
    const vis = live.layerVis[layerId];
    uniforms.uDim.value = live.layerDim[layerId];
    uniforms.uVis.value = vis;
    uniforms.uBoost.value = live.layerDim[layerId] < 0.05 && useTwinStore.getState().focus === layerId ? 0.35 : 0;
    const visible = vis > 0.01;
    for (const r of [pipesRef, elbowsRef, hubsRef, flangesRef]) if (r.current) r.current.visible = visible;
    if (risersRef.current) risersRef.current.visible = visible && live.exploded < 0.05;
    if (pipesRef.current) pipesRef.current.raycast = visible && undergroundInteractive() ? InstancedMesh.prototype.raycast : noRaycast;

    if (isWater) {
      uniforms.uIsolation.value = live.isolation;
      uniforms.uReroute.value = live.reroute;
      const tone = live.repairTone;
      const burst = live.burst;
      let mix = Math.min(1, live.isolation + (tone > 0.01 ? 1 : 0)) * (1 - Math.min(1, Math.max(0, tone - 1)));
      if (tone < 1) tmp.copy(RED).lerp(AMBER, tone);
      else tmp.copy(AMBER).lerp(uniforms.uColor.value, Math.min(1, tone - 1));
      if (burst > 0.01) {
        mix = Math.max(mix, burst);
        tmp.lerp(RED, burst);
      }
      if (live.future > 0.01) {
        mix = Math.max(mix, live.future * 0.85);
        tmp.lerp(RED, live.future);
      }
      uniforms.uHighlightColor.value.copy(tmp);
      uniforms.uHighlightMix.value = mix;
      uniforms.uHighlightSeg.value = leakIdx;
    }

    const st = useTwinStore.getState();
    const h = st.hover;
    uniforms.uHoverSeg.value = h?.kind === 'pipe' && h.layer === layerId && h.variant === network.variant ? h.index : -1;
    const sel = st.selection?.info;
    const selSeg = sel?.kind === 'pipe' && sel.layer === layerId && sel.variant === network.variant ? sel.index : -1;
    uniforms.uSelectedSeg.value = selSeg;
    uniforms.uHiddenSeg.value = selSeg;
  });

  const selection = useTwinStore((s) => s.selection);
  const selectedPipe: PipeInstance | undefined =
    selection?.info.kind === 'pipe' && selection.info.layer === layerId && selection.info.variant === network.variant
      ? built.pipes.find((p) => p.seg === (selection.info as { index: number }).index)
      : undefined;

  return (
    <group>
      <instancedMesh
        ref={pipesRef}
        args={[pipeGeo, pipeMat, built.pipes.length]}
        frustumCulled={false}
        onPointerMove={(e) => {
          if (e.instanceId === undefined) return;
          e.stopPropagation();
          setHover({ kind: 'pipe', layer: layerId, variant: network.variant, index: built.pipes[e.instanceId].seg });
        }}
        onPointerOut={() => setHover(null)}
        onClick={(e) => {
          if (e.delta > 4 || e.instanceId === undefined) return;
          e.stopPropagation();
          const p = built.pipes[e.instanceId];
          const local = e.object.worldToLocal(e.point.clone());
          select({ info: { kind: 'pipe', layer: layerId, variant: network.variant, index: p.seg }, point: [local.x, local.y, local.z] });
        }}
      />
      <instancedMesh ref={elbowsRef} args={[elbowGeo, fitMat, Math.max(1, built.elbows.length)]} frustumCulled={false} raycast={noRaycast} />
      <instancedMesh ref={hubsRef} args={[hubGeo, fitMat, Math.max(1, built.hubs.length)]} frustumCulled={false} raycast={noRaycast} />
      <instancedMesh ref={flangesRef} args={[cylGeo, flangeMat, Math.max(1, built.flanges.length)]} frustumCulled={false} raycast={noRaycast} />
      <instancedMesh ref={risersRef} args={[cylGeo, fitMat, Math.max(1, built.risers.length)]} frustumCulled={false} raycast={noRaycast} />
      {selectedPipe && <SelectedFlow pipe={selectedPipe} network={network} />}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Selected pipe: glass shell + particles streaming inside             */
/* ------------------------------------------------------------------ */

const FLOW_LOOK: Record<string, { speed: number; size: number; color: string; stretch: number; box: boolean; density: number }> = {
  water: { speed: 4.2, size: 0.045, color: '#8fe8ff', stretch: 1.6, box: false, density: 3.2 },
  electric: { speed: 14, size: 0.035, color: '#ffd44d', stretch: 7, box: false, density: 0.9 },
  telecom: { speed: 18, size: 0.03, color: '#5ff5d6', stretch: 2.2, box: true, density: 1.4 },
  sewage: { speed: 1.2, size: 0.07, color: '#f3a95a', stretch: 1.2, box: false, density: 2.2 },
  cooling: { speed: 2.6, size: 0.04, color: '#d2f8ff', stretch: 1.5, box: false, density: 2.6 },
};

function SelectedFlow({ pipe, network }: { pipe: PipeInstance; network: Network }) {
  const look = FLOW_LOOK[network.layer.id];
  const seg = network.segments[pipe.seg];
  const dir = useMemo(() => pipe.end.clone().sub(pipe.start).normalize(), [pipe]);
  const len = pipe.start.distanceTo(pipe.end);
  const count = Math.min(220, Math.max(16, Math.round(len * look.density)));

  const shellGeo = useMemo(() => {
    const g = new CylinderGeometry(pipe.radius * 1.04, pipe.radius * 1.04, len, 28, 1, true);
    return g;
  }, [pipe, len]);
  const shellMat = useMemo(() => createGlassShellMaterial(new Color(network.layer.glow)), [network]);
  const shellRef = useRef<Mesh>(null);

  const particleGeo = useMemo(() => {
    const base = look.box ? new BoxGeometry(1, 1, 1) : new SphereGeometry(1, 8, 6);
    const aPhase = new Float32Array(count);
    const aJit = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      aPhase[i] = (i + ((i * 0.618) % 1) * 0.6) / count;
      const ang = i * 2.399;
      const rr = Math.sqrt(((i * 0.7548) % 1)) * 0.62;
      aJit[i * 2] = Math.cos(ang) * rr;
      aJit[i * 2 + 1] = Math.sin(ang) * rr;
    }
    base.setAttribute('aPhase', new InstancedBufferAttribute(aPhase, 1));
    base.setAttribute('aJit', new InstancedBufferAttribute(aJit, 2));
    return base;
  }, [count, look.box]);

  const particleMat = useMemo(() => {
    const b1 = new Vector3().crossVectors(dir, new Vector3(0, 1, 0));
    if (b1.lengthSq() < 1e-4) b1.set(1, 0, 0);
    b1.normalize();
    const b2 = new Vector3().crossVectors(dir, b1).normalize();
    const flowSign = seg.flowDir === 0 ? 1 : seg.flowDir;
    return new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime: G.uTime,
        uStart: { value: pipe.start.clone() },
        uDir: { value: dir.clone().multiplyScalar(flowSign) },
        uLen: { value: len },
        uSpeed: { value: look.speed },
        uRadius: { value: pipe.radius },
        uSize: { value: look.size },
        uStretch: { value: look.stretch },
        uB1: { value: b1 },
        uB2: { value: b2 },
        uColor: { value: new Color(look.color).multiplyScalar(2.2) },
        uFlip: { value: flowSign < 0 ? 1 : 0 },
      },
      vertexShader: /* glsl */ `
        attribute float aPhase;
        attribute vec2 aJit;
        uniform float uTime;
        uniform vec3 uStart;
        uniform vec3 uDir;
        uniform float uLen;
        uniform float uSpeed;
        uniform float uRadius;
        uniform float uSize;
        uniform float uStretch;
        uniform vec3 uB1;
        uniform vec3 uB2;
        uniform float uFlip;
        varying float vFade;
        void main() {
          float s = fract(aPhase + uTime * uSpeed / uLen) * uLen;
          vec3 origin = uFlip > 0.5 ? uStart - uDir * uLen : uStart;
          vec3 c = origin + uDir * s + (uB1 * aJit.x + uB2 * aJit.y) * uRadius;
          vec3 p = position * uSize;
          vec3 world = c + uB1 * p.x + uB2 * p.z + uDir * p.y * uStretch;
          vFade = smoothstep(0.0, 0.8, s) * smoothstep(uLen, uLen - 0.8, s);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(world, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        varying float vFade;
        void main() {
          gl_FragColor = vec4(uColor * vFade, 1.0);
        }
      `,
    });
  }, [dir, pipe, len, look, seg.flowDir]);

  const mid = pipe.start.clone().add(pipe.end).multiplyScalar(0.5);
  useLayoutEffect(() => {
    const m = shellRef.current;
    if (!m) return;
    m.position.copy(mid);
    m.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), dir);
  });

  return (
    <group>
      <mesh ref={shellRef} geometry={shellGeo} material={shellMat} raycast={noRaycast} renderOrder={8} />
      <instancedMesh args={[particleGeo, particleMat, count]} frustumCulled={false} raycast={noRaycast} renderOrder={9} />
    </group>
  );
}
