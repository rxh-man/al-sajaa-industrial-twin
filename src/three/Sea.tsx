import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BoxGeometry, BufferGeometry, Color, DoubleSide, ExtrudeGeometry, Float32BufferAttribute, Group, MeshStandardMaterial, PlaneGeometry, Shape, Vector3, Vector4, type Intersection, type Raycaster } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { DIORAMA, RIVER } from '../data/city';
import { AD } from '../data/abudhabi';
import { LAMP_H, PROMENADE } from '../data/lamps';
import { G } from './shaders/globals';
import { GLSL_COMMON } from './shaders/glsl';
import { patchMaterial, WORLDPOS_FRAG_HEAD, WORLDPOS_VERT_END, WORLDPOS_VERT_HEAD } from './shaders/patch';
import { GROUND_MAP_UNIFORMS, createPropMaterial } from './materials/surfaceMaterials';
import { wall } from './Ground';

const noRaycast = (_r: Raycaster, _i: Intersection[]) => {};

const W = DIORAMA.maxX - DIORAMA.minX;
const D = DIORAMA.maxZ - DIORAMA.minZ;
const CX = (DIORAMA.minX + DIORAMA.maxX) / 2;
const CZ = (DIORAMA.minZ + DIORAMA.maxZ) / 2;

/* ------------------------------------------------------------------ */
/* Boats                                                               */
/* ------------------------------------------------------------------ */

interface BoatDef {
  z: number;
  dir: 1 | -1;
  speed: number;
  x0: number;
  length: number;
  build: () => BufferGeometry;
}

/** Per-vertex colour + glow (window bands, navigation lights). */
function part(g: BufferGeometry, color: string, glow = 0) {
  const ng = g.index ? g.toNonIndexed() : g;
  if (ng.getAttribute('uv')) ng.deleteAttribute('uv');
  const n = ng.getAttribute('position').count;
  const c = new Color(color);
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  ng.setAttribute('color', new Float32BufferAttribute(col, 3));
  ng.setAttribute('aGlow', new Float32BufferAttribute(new Float32Array(n).fill(glow), 1));
  return ng;
}

const bx = (w: number, h: number, l: number, x: number, y: number, z: number, color: string, glow = 0) => part(new BoxGeometry(w, h, l).translate(x, y, z), color, glow);

/** Hull from a plan-view outline (pointed bow), extruded downwards. Forward = +x. */
function hull(length: number, width: number, depth: number, color: string, bow = 0.22) {
  const s = new Shape();
  const L = length / 2;
  const Wd = width / 2;
  s.moveTo(-L, -Wd);
  s.lineTo(L - length * bow, -Wd);
  s.quadraticCurveTo(L, -Wd * 0.6, L, 0);
  s.quadraticCurveTo(L, Wd * 0.6, L - length * bow, Wd);
  s.lineTo(-L, Wd);
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 6 });
  g.rotateX(Math.PI / 2);
  g.translate(0, depth * 0.55, 0);
  return part(g, color);
}

/** Wooden dinner-cruise dhow: teak hull with a raised stern, lantern-lit deck house under a canopy. */
function dhow() {
  const teak = '#5b3a22';
  const parts = [hull(6.0, 1.3, 0.46, teak, 0.32), bx(5.2, 0.06, 1.12, -0.3, 0.3, 0, '#7a5232')];
  parts.push(bx(0.9, 0.34, 1.2, -2.55, 0.5, 0, '#4a2f1b'));
  parts.push(bx(0.5, 0.14, 0.16, 2.85, 0.55, 0, '#4a2f1b'));
  parts.push(bx(0.24, 0.12, 0.14, 3.15, 0.66, 0, '#4a2f1b'));
  parts.push(bx(3.4, 0.4, 0.98, -0.3, 0.52, 0, '#eadfc6'));
  parts.push(bx(3.42, 0.13, 1.0, -0.3, 0.56, 0, '#ffb35c', 1.4));
  parts.push(bx(3.8, 0.05, 1.22, -0.3, 0.84, 0, '#c9a46a'));
  for (let i = 0; i < 9; i++) for (const z of [-0.62, 0.62]) parts.push(bx(0.05, 0.05, 0.05, -2.1 + i * 0.45, 0.8, z, '#ffd27a', 4.5));
  parts.push(bx(0.05, 0.9, 0.05, 1.7, 0.75, 0, '#3a2616'));
  parts.push(bx(0.08, 0.08, 0.08, 1.7, 1.24, 0, '#ffffff', 6));
  parts.push(bx(0.08, 0.08, 0.08, 1.2, 0.5, 0.6, '#20ff70', 5));
  parts.push(bx(0.08, 0.08, 0.08, 1.2, 0.5, -0.6, '#ff2a2a', 5));
  return mergeGeometries(parts, false)!;
}

function tourBoat() {
  const parts = [hull(3.8, 0.8, 0.3, '#eef0f2', 0.18), bx(3.0, 0.32, 0.66, -0.15, 0.42, 0, '#e4e7ea')];
  parts.push(bx(3.02, 0.16, 0.68, -0.15, 0.44, 0, '#2a3440', 1.4));
  parts.push(bx(2.4, 0.05, 0.6, -0.35, 0.62, 0, '#c9cdd2'));
  for (let i = 0; i < 5; i++) parts.push(bx(0.04, 0.12, 0.6, -1.4 + i * 0.52, 0.7, 0, '#9aa2ab'));
  parts.push(bx(0.08, 0.08, 0.08, 1.3, 0.6, 0.36, '#20ff70', 5));
  parts.push(bx(0.08, 0.08, 0.08, 1.3, 0.6, -0.36, '#ff2a2a', 5));
  parts.push(bx(0.08, 0.08, 0.08, -0.4, 0.82, 0, '#ffffff', 5));
  return mergeGeometries(parts, false)!;
}

function launch() {
  const parts = [hull(1.25, 0.42, 0.18, '#d7dce1', 0.3), bx(0.4, 0.18, 0.34, -0.15, 0.26, 0, '#1d2630', 0.6), bx(0.06, 0.06, 0.06, -0.4, 0.36, 0, '#ffffff', 5)];
  return mergeGeometries(parts, false)!;
}

/** Lanes in open water off the Corniche (the whole width is sea beyond z ≈ 62). */
export const BOATS: BoatDef[] = [
  { z: 74.2, dir: -1, speed: 0.75, x0: 30, length: 6.0, build: dhow },
  { z: 80.2, dir: 1, speed: 1.15, x0: -60, length: 3.8, build: tourBoat },
  { z: 68.8, dir: 1, speed: 2.6, x0: 10, length: 1.25, build: launch },
];

const SPAN = 200;
function boatX(b: BoatDef, t: number) {
  const raw = b.x0 + b.dir * b.speed * t + 100;
  return (((raw % SPAN) + SPAN) % SPAN) - 100;
}

/** Shared with the water shader so the wakes follow the hulls. */
const boatUniform = { value: BOATS.map(() => new Vector4(0, 0, 1, 0)) };

function createBoatMaterial() {
  const mat = new MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 0.55, metalness: 0.15, transparent: true });
  return patchMaterial(mat, {
    key: 'boat',
    uniforms: { uXray: G.uXray, uMaxX: { value: DIORAMA.maxX } },
    vertexHead: WORLDPOS_VERT_HEAD + 'attribute float aGlow; varying float vGlow;',
    vertexTransform: 'vGlow = aGlow;',
    vertexEnd: WORLDPOS_VERT_END,
    fragmentHead: WORLDPOS_FRAG_HEAD + 'uniform float uXray; uniform float uMaxX; varying float vGlow;',
    fragmentColor: 'if (abs(vWPos.x) > uMaxX) discard;',
    fragmentEmissive: `
      totalEmissiveRadiance += (vGlow > 1.5 ? vColor.rgb * vGlow : vec3(1.0, 0.78, 0.5) * vGlow) * (1.0 - uXray);
      roughnessFactor = mix(roughnessFactor, 0.15, step(0.5, vGlow));
    `,
    fragmentOutput: 'diffuseColor.a *= 1.0 - uXray * 0.92;',
  });
}

function Boats() {
  const geos = useMemo(() => BOATS.map((b) => b.build()), []);
  const mat = useMemo(() => createBoatMaterial(), []);
  const refs = useRef<(Group | null)[]>([]);
  useFrame(() => {
    const t = G.uTime.value;
    BOATS.forEach((b, i) => {
      const x = boatX(b, t);
      const bob = Math.sin(t * 1.3 + i * 2.1) * 0.025;
      const g = refs.current[i];
      if (g) {
        g.position.set(x, RIVER.level + bob, b.z);
        g.rotation.set(Math.sin(t * 0.9 + i) * 0.012, b.dir > 0 ? 0 : Math.PI, Math.sin(t * 1.1 + i * 3.0) * 0.02);
      }
      boatUniform.value[i].set(x, b.z, b.dir, b.length);
    });
  });
  return (
    <group>
      {BOATS.map((_, i) => (
        <group
          key={i}
          ref={(g) => {
            refs.current[i] = g;
          }}
        >
          <mesh geometry={geos[i]} material={mat} raycast={noRaycast} castShadow receiveShadow />
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Water                                                               */
/* ------------------------------------------------------------------ */

/** The promenade lamps, mirrored in the water (their heads, at the real seawall). */
const LAMP_HEADS = { value: PROMENADE.map((l) => new Vector3(l.x + l.ox * 0.38, LAMP_H - 0.045, l.z + l.oz * 0.38)) };
const N_LAMPS = Math.max(1, PROMENADE.length);

/** The Gulf at dusk: dark water, swells, foam along the seawall and boat wakes, the promenade lamps mirrored in it. */
function createWaterMaterial() {
  const m = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.08, metalness: 0.6, transparent: true, envMapIntensity: 2.0 });
  return patchMaterial(m, {
    key: 'gulf-dusk',
    uniforms: { ...GROUND_MAP_UNIFORMS, uTime: G.uTime, uXray: G.uXray, uBoats: boatUniform, uLamps: LAMP_HEADS },
    vertexHead: WORLDPOS_VERT_HEAD,
    vertexEnd: WORLDPOS_VERT_END,
    fragmentHead:
      WORLDPOS_FRAG_HEAD +
      /* glsl */ `
      uniform float uTime;
      uniform float uXray;
      uniform vec4 uBoats[${BOATS.length}];
      uniform vec3 uLamps[${N_LAMPS}];
      uniform sampler2D uGroundMap;
      uniform vec4 uGroundRect;
      float gFoam;
      vec3 gWaterN;
      float gWake;
      float gShore;
      vec2 groundUv(vec2 p) {
        vec2 uv = (p - uGroundRect.xy) * uGroundRect.zw;
        return vec2(uv.x, 1.0 - uv.y);
      }
      // land coverage around p: the sharp mask, or a blurred mip of it (how close the seawall is)
      float landAt(vec2 p) { return texture2D(uGroundMap, groundUv(p)).a; }
      float shoreAt(vec2 p, float lod) { return textureLod(uGroundMap, groundUv(p), lod).a; }
    ` +
      GLSL_COMMON +
      /* glsl */ `
      // height field: long swells rolling in + choppy cross waves
      float waveH(vec2 p) {
        float h = 0.0;
        h += sin(p.x * 0.55 - uTime * 0.9 + p.y * 0.12) * 0.5;
        h += sin(p.x * 1.3 + p.y * 0.7 - uTime * 1.7) * 0.25;
        h += sin(p.x * -0.9 + p.y * 1.9 - uTime * 1.3) * 0.18;
        h += (gnoise(p * 2.2 + vec2(-uTime * 0.6, uTime * 0.2)) - 0.5) * 0.5;
        h += (gnoise(p * 5.5 + vec2(uTime * 0.9, -uTime * 0.4)) - 0.5) * 0.18;
        return h;
      }
      float wakeAt(vec2 p) {
        float w = 0.0;
        for (int i = 0; i < ${BOATS.length}; i++) {
          vec4 b = uBoats[i];
          float along = (p.x - b.x) * b.z;          // + ahead of the bow
          float lat = abs(p.y - b.y);
          float behind = -(along + b.w * 0.45);
          if (behind < -b.w * 0.6 || behind > 26.0) continue;
          float spread = 0.25 + max(behind, 0.0) * 0.36;
          float arm = abs(lat - spread);
          float armW = 0.12 + behind * 0.035;
          float broken = 0.35 + 0.65 * gnoise(vec2(behind * 1.7 - uTime * 0.8, lat * 2.0 + float(i) * 5.0));
          float v = exp(-arm / armW) * step(0.0, behind) * (1.0 - smoothstep(2.0, 15.0, behind)) * broken;
          float trail = exp(-lat * lat * 5.0) * step(0.0, behind) * (1.0 - smoothstep(1.0, 10.0, behind)) * broken;
          float bow = exp(-length(vec2(along - b.w * 0.5, lat) * vec2(1.4, 3.5)) * 2.0);
          w += v * 0.8 + trail * 0.6 + bow * 0.5;
        }
        return w;
      }
    `,
    fragmentColor: /* glsl */ `
      {
        vec2 rp = vWPos.xz;
        if (landAt(rp) > 0.5) discard;
        float e = 0.08;
        float h0 = waveH(rp);
        float hx = waveH(rp + vec2(e, 0.0));
        float hz = waveH(rp + vec2(0.0, e));
        float amp = 0.06;
        gWaterN = normalize(vec3(-(hx - h0) / e * amp, 1.0, -(hz - h0) / e * amp));
        gWake = wakeAt(rp);
        // how close the seawall is (blurred land mask): foam right against it, shallower water near it
        float nearWall = shoreAt(rp, 4.0);
        gShore = shoreAt(rp, 6.5);
        float churn = gnoise(rp * 3.0 + vec2(uTime * 0.7, 0.0));
        gFoam = smoothstep(0.1, 0.42 + churn * 0.2, nearWall) * 0.7 + clamp(gWake * (0.55 + 0.6 * churn), 0.0, 1.0);
        gFoam = clamp(gFoam, 0.0, 1.0);
        // warm, shallow Gulf water: teal over the sandy shelf
        vec3 deep = vec3(0.01, 0.04, 0.05);
        vec3 shallow = vec3(0.03, 0.09, 0.09);
        vec3 water = mix(deep, shallow, clamp(smoothstep(0.0, 0.45, gShore) + h0 * 0.06, 0.0, 1.0));
        diffuseColor.rgb = mix(water, vec3(0.55, 0.6, 0.62), gFoam * 0.8);
      }
    `,
    fragmentEmissive: /* glsl */ `
      {
        normal = normalize((viewMatrix * vec4(gWaterN, 0.0)).xyz);
        roughnessFactor = mix(0.07, 0.6, gFoam);
        metalnessFactor = mix(0.6, 0.0, gFoam);
        vec2 rp = vWPos.xz;
        // promenade lamps mirrored in the water: each reflection sits where the camera ray to the
        // lamp's mirror image meets the surface, smeared towards the viewer by the waves
        float refl = 0.0;
        float level = ${RIVER.level.toFixed(3)};
        for (int k = 0; k < ${N_LAMPS}; k++) {
          vec3 Lm = vec3(uLamps[k].x, 2.0 * level - uLamps[k].y, uLamps[k].z);
          float tt = (level - cameraPosition.y) / (Lm.y - cameraPosition.y);
          vec2 Wp = cameraPosition.xz + (Lm.xz - cameraPosition.xz) * tt;
          vec2 dir = normalize(cameraPosition.xz - Wp + vec2(1e-4));
          vec2 q = rp - Wp;
          float lat = dot(q, vec2(-dir.y, dir.x));
          if (abs(lat) > 1.6) continue;
          float along = dot(q, dir);
          lat += (gnoise(vec2(along * 2.6 - uTime * 2.4, float(k))) - 0.5) * 0.35;
          float col = exp(-lat * lat * 9.0) * exp(-abs(along) * (along > 0.0 ? 0.32 : 0.9));
          col *= 0.45 + 0.55 * gnoise(vec2(along * 5.0 + uTime * 3.0, lat * 4.0 + float(k)));
          refl += col;
        }
        totalEmissiveRadiance += vec3(1.0, 0.74, 0.44) * refl * 0.8 * (1.0 - gFoam) * (1.0 - uXray);
        // dusk sky sheen + warm city glow along the Corniche
        totalEmissiveRadiance += vec3(0.018, 0.03, 0.055) * (1.0 - uXray);
        totalEmissiveRadiance += vec3(0.9, 0.6, 0.35) * 0.02 * smoothstep(0.0, 0.6, gShore) * (1.0 - uXray);
      }
    `,
    fragmentOutput: 'diffuseColor.a = mix(0.96, 0.25, uXray);',
  });
}

function createSeabedMaterial() {
  const mat = new MeshStandardMaterial({ color: '#1c201f', roughness: 1, metalness: 0, transparent: true });
  return patchMaterial(mat, {
    key: 'seabed-dusk',
    uniforms: { ...GROUND_MAP_UNIFORMS, uXray: G.uXray },
    vertexHead: WORLDPOS_VERT_HEAD,
    vertexEnd: WORLDPOS_VERT_END,
    fragmentHead:
      WORLDPOS_FRAG_HEAD +
      /* glsl */ `
      uniform float uXray;
      uniform sampler2D uGroundMap;
      uniform vec4 uGroundRect;
      float landAt(vec2 p) {
        vec2 uv = (p - uGroundRect.xy) * uGroundRect.zw;
        return texture2D(uGroundMap, vec2(uv.x, 1.0 - uv.y)).a;
      }
    `,
    fragmentColor: 'if (landAt(vWPos.xz) > 0.5) discard;',
    fragmentOutput: 'diffuseColor.a = mix(1.0, 0.15, uXray);',
  });
}

/** The Corniche at dusk: the sea, its bed, the stone seawall along the real coastline, and boats on the Gulf. */
export function Sea() {
  const water = useMemo(() => createWaterMaterial(), []);
  const seabed = useMemo(() => createSeabedMaterial(), []);
  const stone = useMemo(() => createPropMaterial({ color: '#6f6a61', roughness: 0.85, side: DoubleSide }), []);
  const plane = useMemo(() => new PlaneGeometry(W, D, 1, 1), []);
  const seawall = useMemo(() => wall(AD.coast, RIVER.bed, 0.02), []);

  return (
    <group>
      <mesh geometry={plane} rotation-x={-Math.PI / 2} position={[CX, RIVER.level, CZ]} material={water} renderOrder={2} receiveShadow raycast={noRaycast} />
      <mesh geometry={plane} rotation-x={-Math.PI / 2} position={[CX, RIVER.bed, CZ]} material={seabed} receiveShadow raycast={noRaycast} />
      <mesh geometry={seawall} material={stone} castShadow receiveShadow raycast={noRaycast} />
      <Boats />
    </group>
  );
}
