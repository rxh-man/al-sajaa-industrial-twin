import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BoxGeometry, BufferGeometry, Color, Float32BufferAttribute, InstancedBufferAttribute, InstancedMesh, LineBasicMaterial, LineLoop, Mesh, MeshStandardMaterial, BackSide, type Intersection, type Raycaster } from 'three';
import { TRENCH } from '../data/incident';
import { live } from '../simulation/runtime';
import { G } from './shaders/globals';
import { GLSL_COMMON, GLSL_STRATA } from './shaders/glsl';
import { patchMaterial, WORLDPOS_FRAG_HEAD, WORLDPOS_VERT_END, WORLDPOS_VERT_HEAD } from './shaders/patch';
import { GROUND_MAP_UNIFORMS, ROAD_GLSL } from './materials/surfaceMaterials';

const noRaycast = (_r: Raycaster, _i: Intersection[]) => {};
const TILE_T = 0.32;

/**
 * Road tiles covering the excavation. When the incident opens the ground they
 * peel away (staggered from the leak outward), lift, tumble and fade — then fly
 * back in reverse when the repair is complete.
 */
function TrenchTiles() {
  const nx = 12;
  const nz = 5;
  const count = nx * nz;
  const geometry = useMemo(() => {
    const g = new BoxGeometry(1, 1, 1);
    const center = new Float32Array(count * 3);
    const size = new Float32Array(count * 3);
    const delay = new Float32Array(count);
    const rnd = new Float32Array(count * 4);
    const w = (TRENCH.maxX - TRENCH.minX) / nx;
    const d = (TRENCH.maxZ - TRENCH.minZ) / nz;
    let i = 0;
    let maxDist = 0;
    const dists: number[] = [];
    for (let ix = 0; ix < nx; ix++) {
      for (let iz = 0; iz < nz; iz++) {
        const cx = TRENCH.minX + w * (ix + 0.5);
        const cz = TRENCH.minZ + d * (iz + 0.5);
        center.set([cx, -TILE_T / 2, cz], i * 3);
        size.set([w * 0.995, TILE_T, d * 0.995], i * 3);
        const dist = Math.hypot(cx - 1.5, (cz + 2.4) * 1.4);
        dists.push(dist);
        maxDist = Math.max(maxDist, dist);
        const h = Math.sin(i * 12.9898) * 43758.5453;
        const f = (v: number) => v - Math.floor(v);
        rnd.set([f(h), f(h * 1.37), f(h * 2.11), f(h * 3.07)], i * 4);
        i++;
      }
    }
    dists.forEach((dd, k) => (delay[k] = dd / maxDist));
    g.setAttribute('aCenter', new InstancedBufferAttribute(center, 3));
    g.setAttribute('aSize', new InstancedBufferAttribute(size, 3));
    g.setAttribute('aDelay', new InstancedBufferAttribute(delay, 1));
    g.setAttribute('aRnd', new InstancedBufferAttribute(rnd, 4));
    return g;
  }, [count]);

  const material = useMemo(() => {
    const m = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, metalness: 0, transparent: true, envMapIntensity: 0.4 });
    return patchMaterial(m, {
      key: 'trench-tiles',
      uniforms: { ...GROUND_MAP_UNIFORMS, uTrench: G.uTrench, uXray: G.uXray, uTime: G.uTime, uGhostColor: G.uGhostColor },
      vertexHead: /* glsl */ `
        uniform float uTrench;
        attribute vec3 aCenter;
        attribute vec3 aSize;
        attribute float aDelay;
        attribute vec4 aRnd;
        varying vec2 vRoad;
        varying float vProg;
        varying vec3 vTileBox;
        varying vec3 vTileN;
        vec3 rotAxis(vec3 v, vec3 axis, float a) {
          float c = cos(a); float s = sin(a);
          return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
        }
      `,
      vertexNormal: /* glsl */ `
        float tp = clamp(uTrench * 1.75 - aDelay * 0.75, 0.0, 1.0);
        float te = tp * tp * (3.0 - 2.0 * tp);
        vec3 tAxis = normalize(vec3(aRnd.z - 0.5, 0.0, aRnd.w - 0.5) + vec3(0.001));
        float tAng = te * (1.1 + aRnd.x * 1.6) * (aRnd.y > 0.5 ? 1.0 : -1.0);
        objectNormal = rotAxis(objectNormal, tAxis, tAng);
        vProg = te;
        vTileN = normal;
      `,
      vertexTransform: /* glsl */ `
        vTileBox = position;
        vRoad = aCenter.xz + position.xz * aSize.xz;
        vec3 lp = position * aSize;
        lp = rotAxis(lp, tAxis, tAng) * (1.0 - te * 0.5);
        transformed = aCenter + lp + vec3((aRnd.z - 0.5) * te * 3.0, te * (3.5 + aRnd.x * 5.0), (aRnd.w - 0.5) * te * 2.4);
      `,
      fragmentHead:
        /* glsl */ `
        uniform float uXray;
        uniform float uTime;
        uniform vec3 uGhostColor;
        varying vec2 vRoad;
        varying float vProg;
        varying vec3 vTileBox;
        varying vec3 vTileN;
      ` +
        GLSL_COMMON +
        ROAD_GLSL,
      fragmentColor: /* glsl */ `
        RoadSample trs = roadSample(vRoad);
        float isTop = step(0.5, vTileN.y);
        diffuseColor.rgb = mix(vec3(0.05, 0.05, 0.055), trs.color, isTop);
      `,
      fragmentEmissive: /* glsl */ `
        totalEmissiveRadiance += trs.emissive * isTop;
        {
          float sw0 = mod(uTime * 13.0, 300.0) - 150.0;
          float swd = (vRoad.x + vRoad.y * 0.55) - sw0;
          float swv = exp(-abs(swd) * 0.55) * 0.06 + exp(-abs(swd) * 4.0) * 0.05;
          totalEmissiveRadiance += vec3(0.25, 0.75, 1.0) * swv * isTop * (1.0 - uXray) * (1.0 - vProg);
        }
        vec3 ab = abs(vTileBox);
        float e1 = max(ab.x, ab.z);
        float edgeGlow = smoothstep(0.44, 0.5, e1) * isTop + (1.0 - isTop) * 0.25;
        float act = vProg * (1.0 - vProg) * 4.0;
        totalEmissiveRadiance += vec3(0.35, 0.85, 1.0) * edgeGlow * act * 1.3;
      `,
      fragmentOutput: /* glsl */ `
        outgoingLight = mix(outgoingLight, outgoingLight * 0.35, uXray);
        diffuseColor.a = (1.0 - smoothstep(0.45, 0.95, vProg)) * mix(1.0, 0.22, uXray);
        if (diffuseColor.a < 0.01) discard;
      `,
    });
  }, []);

  const ref = useRef<InstancedMesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.visible = live.trench < 0.999;
    material.depthWrite = G.uXray.value < 0.55 && live.trench < 0.02;
  });

  return <instancedMesh ref={ref} args={[geometry, material, count]} frustumCulled={false} raycast={noRaycast} receiveShadow renderOrder={2} />;
}

/** Inner faces of the excavation: soil strata, depth grid, wet-soil stain and a reveal scan. */
function TrenchWalls() {
  const geometry = useMemo(() => {
    const { minX, maxX, minZ, maxZ, floor } = TRENCH;
    const g = new BoxGeometry(maxX - minX, -floor, maxZ - minZ);
    g.translate((minX + maxX) / 2, floor / 2, (minZ + maxZ) / 2);
    // drop the top face (group index 2 = +y)
    const idx = g.getIndex()!;
    const groups = g.groups;
    const top = groups[2];
    const arr = Array.from(idx.array);
    arr.splice(top.start, top.count);
    g.setIndex(arr);
    g.clearGroups();
    return g;
  }, []);

  const material = useMemo(() => {
    const m = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.95, metalness: 0, side: BackSide, transparent: true, envMapIntensity: 0.3 });
    return patchMaterial(m, {
      key: 'trench-walls',
      uniforms: { uTrench: G.uTrench, uXray: G.uXray, uTime: G.uTime, uLeakPos: G.uLeakPos, uMoisture: G.uMoisture, uFuture: G.uFuture, uBurst: G.uBurst },
      vertexHead: WORLDPOS_VERT_HEAD,
      vertexEnd: WORLDPOS_VERT_END,
      fragmentHead:
        WORLDPOS_FRAG_HEAD +
        /* glsl */ `
        uniform float uTrench;
        uniform float uXray;
        uniform float uTime;
        uniform vec3 uLeakPos;
        uniform float uMoisture;
        uniform float uFuture;
        uniform float uBurst;
      ` +
        GLSL_COMMON +
        GLSL_STRATA,
      fragmentColor: /* glsl */ `
        vec2 hp = vec2(vWPos.x + vWPos.z * 1.3, vWPos.y);
        vec3 sc = strataColor(vWPos.y, hp);
        // wet soil around the leak
        float md = distance(vWPos, uLeakPos);
        float wetR = uMoisture * 2.4 + 0.2;
        float wet = 1.0 - smoothstep(wetR * 0.6, wetR + gnoise(vWPos.xy * 1.3 + vWPos.zy) * 1.4, md);
        wet *= step(0.01, uMoisture);
        sc = mix(sc, sc * vec3(0.38, 0.46, 0.58), wet * 0.85);
        // depth grid (1 unit)
        float gy = abs(fract(vWPos.y + 0.5) - 0.5);
        float gl = 1.0 - smoothstep(0.0, fwidth(vWPos.y) * 1.2 + 0.003, gy);
        sc += vec3(0.05, 0.09, 0.12) * gl * 0.5;
        diffuseColor.rgb = sc;
      `,
      fragmentEmissive: /* glsl */ `
        roughnessFactor = mix(roughnessFactor, 0.35, wet);
        float scanY = -uTrench * 13.5 + 0.5;
        float scan = exp(-abs(vWPos.y - scanY) * 2.5) * step(0.02, uTrench) * (1.0 - smoothstep(0.85, 1.0, uTrench));
        totalEmissiveRadiance += vec3(0.3, 0.8, 1.0) * scan * 1.6;
        totalEmissiveRadiance += vec3(0.05, 0.2, 0.35) * wet * (0.3 + 0.2 * sin(uTime * 2.0));
      `,
      fragmentOutput: /* glsl */ `
        float reveal = smoothstep(0.0, 0.25, uTrench);
        // walls reveal top-down as the scan passes
        float below = step(scanY - 0.3, vWPos.y) + step(0.85, uTrench);
        diffuseColor.a = reveal * min(1.0, below) * mix(1.0, 0.38, uXray);
        outgoingLight = mix(outgoingLight, outgoingLight * 0.8, uXray);
        if (diffuseColor.a < 0.01) discard;
      `,
    });
  }, []);

  const ref = useRef<Mesh>(null);
  useFrame(() => {
    if (!ref.current) return;
    ref.current.visible = live.trench > 0.005 && live.exploded < 0.9;
    material.depthWrite = G.uXray.value < 0.5;
  });
  return <mesh ref={ref} geometry={geometry} material={material} raycast={noRaycast} renderOrder={1} />;
}

/** Bright outline of the cut on the road surface. */
function TrenchRim() {
  const line = useMemo(() => {
    const { minX, maxX, minZ, maxZ } = TRENCH;
    const g = new BufferGeometry();
    const y = 0.05;
    g.setAttribute('position', new Float32BufferAttribute([minX, y, minZ, maxX, y, minZ, maxX, y, maxZ, minX, y, maxZ], 3));
    const mat = new LineBasicMaterial({ color: new Color('#5fe3ff').multiplyScalar(2.5), transparent: true, opacity: 0, toneMapped: true });
    const l = new LineLoop(g, mat);
    l.raycast = noRaycast;
    return l;
  }, []);
  useFrame(() => {
    const m = line.material as LineBasicMaterial;
    const flash = live.trench > 0 && live.trench < 1 ? 1 : 0.55;
    m.opacity = Math.min(1, live.trench * 6) * flash * (1 - live.exploded);
    line.visible = m.opacity > 0.01;
  });
  return <primitive object={line} />;
}

/** Surface part of the cut-away: lifting road tiles + glowing rim. */
export function Cutaway() {
  return (
    <group>
      <TrenchTiles />
      <TrenchRim />
    </group>
  );
}

export function TrenchVolume() {
  return <TrenchWalls />;
}

