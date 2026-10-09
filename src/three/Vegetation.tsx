import { useLayoutEffect, useMemo, useRef } from 'react';
import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, Float32BufferAttribute, IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3, type Intersection, type Raycaster } from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SECTORS, SECTOR_BY_ID, PLINTH_H } from '../data/city';
import { mulberry32, type Rng } from '../data/rng';
import { TRENCH } from '../data/incident';
import { G } from './shaders/globals';
import { patchMaterial } from './shaders/patch';
import { GLSL_COMMON } from './shaders/glsl';

const noRaycast = (_r: Raycaster, _i: Intersection[]) => {};

/* ------------------------------------------------------------------ */
/* Geometry: crowns of merged, noise-displaced lobes on a tapered trunk */
/* ------------------------------------------------------------------ */

function hash3(x: number, y: number, z: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number, z: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const u = (t: number) => t * t * (3 - 2 * t);
  let v = 0;
  for (let dx = 0; dx < 2; dx++)
    for (let dy = 0; dy < 2; dy++)
      for (let dz = 0; dz < 2; dz++) {
        const w = (dx ? u(fx) : 1 - u(fx)) * (dy ? u(fy) : 1 - u(fy)) * (dz ? u(fz) : 1 - u(fz));
        v += w * hash3(ix + dx, iy + dy, iz + dz);
      }
  return v;
}

/** Tag a geometry with part (0 foliage / 1 bark), sway weight and baked occlusion. */
function finish(g: BufferGeometry, part: number, swayFrom: number, swayTo: number, center: Vector3 | null, radius: number) {
  const pos = g.getAttribute('position');
  const n = pos.count;
  const parts = new Float32Array(n).fill(part);
  const sway = new Float32Array(n);
  const ao = new Float32Array(n);
  const p = new Vector3();
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    sway[i] = Math.min(1, Math.max(0, (p.y - swayFrom) / Math.max(0.01, swayTo - swayFrom)));
    if (center) {
      // darker underneath and towards the core of the crown
      const up = (p.y - center.y) / radius;
      const out = p.distanceTo(center) / radius;
      ao[i] = Math.min(1, Math.max(0.15, 0.55 + up * 0.35 + (out - 0.8) * 0.6));
    } else ao[i] = 0.75;
  }
  g.setAttribute('aPart', new Float32BufferAttribute(parts, 1));
  g.setAttribute('aSway', new Float32BufferAttribute(sway, 1));
  g.setAttribute('aAO', new Float32BufferAttribute(ao, 1));
  if (g.getAttribute('uv')) g.deleteAttribute('uv');
  return g;
}

function lobedCrown(rng: Rng, cy: number, R: number, lobes: number, squash = 0.86) {
  const parts: BufferGeometry[] = [];
  for (let k = 0; k < lobes; k++) {
    const a = (k / lobes) * Math.PI * 2 + rng() * 0.6;
    const ring = k === 0 ? 0 : R * (0.42 + rng() * 0.18);
    const r = R * (k === 0 ? 0.72 : 0.5 + rng() * 0.16);
    const y = cy + (k === 0 ? R * 0.12 : (rng() - 0.35) * R * 0.5);
    const g = new IcosahedronGeometry(r, 1);
    g.deleteAttribute('uv');
    g.scale(1, squash, 1);
    g.translate(Math.cos(a) * ring, y, Math.sin(a) * ring);
    parts.push(g);
  }
  let crown = mergeGeometries(parts, false)!;
  crown = mergeVertices(crown, 1e-4);
  const pos = crown.getAttribute('position');
  const v = new Vector3();
  const c = new Vector3(0, cy, 0);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const d = v.clone().sub(c).normalize();
    const nz = vnoise(v.x * 5.5 + 3.1, v.y * 5.5, v.z * 5.5) - 0.5;
    v.addScaledVector(d, nz * R * 0.22);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  crown.computeVertexNormals();
  return finish(crown, 0, cy - R * 1.2, cy + R, c, R * 1.2);
}

const flat = (g: BufferGeometry) => (g.index ? g.toNonIndexed() : g);

function trunk(h: number, r0: number, r1: number, branches: number, rng: Rng) {
  const parts: BufferGeometry[] = [new CylinderGeometry(r1, r0, h, 7, 1).translate(0, h / 2, 0)];
  for (let b = 0; b < branches; b++) {
    const len = h * (0.45 + rng() * 0.2);
    const g = new CylinderGeometry(r1 * 0.45, r1 * 0.7, len, 5, 1).translate(0, len / 2, 0);
    g.rotateZ((rng() < 0.5 ? -1 : 1) * (0.55 + rng() * 0.35));
    g.rotateY(rng() * Math.PI * 2);
    g.translate(0, h * (0.78 + rng() * 0.15), 0);
    parts.push(g);
  }
  const out = mergeGeometries(parts.map(flat), false)!;
  return finish(out, 1, 0, h * 2.2, null, 1);
}

/** Broad, flat-topped shade tree (neem / ghaf). */
function deciduousGeo(seed: number) {
  const rng = mulberry32(seed);
  const t = trunk(0.62, 0.055, 0.035, 2, rng);
  const c = lobedCrown(rng, 1.02, 0.6, 6, 0.68);
  return mergeGeometries([flat(t), flat(c)], false)!;
}

/** Date palm: a slightly leaning ringed trunk under a crown of arching, drooping fronds. */
function palmGeo(seed: number) {
  const rng = mulberry32(seed);
  const H = 1.28;
  const lean = (rng() - 0.5) * 0.08;
  const trunkG = new CylinderGeometry(0.036, 0.052, H, 7, 6).translate(0, H / 2, 0);
  const tp = trunkG.getAttribute('position');
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i);
    const ring = 1 + 0.12 * Math.max(0, Math.sin(y * 70)); // leaf-base rings
    tp.setXYZ(i, tp.getX(i) * ring + lean * (y / H) ** 2, y, tp.getZ(i) * ring);
  }
  trunkG.computeVertexNormals();
  const top = new Vector3(lean, H, 0);
  const fronds: BufferGeometry[] = [];
  const n = 13;
  for (let k = 0; k < n; k++) {
    const len = 0.5 + rng() * 0.14;
    const g = new BoxGeometry(len, 0.012, 0.15, 6, 1, 1).translate(len / 2, 0, 0);
    const p = g.getAttribute('position');
    const lift = 0.55 - (k % 3) * 0.32; // three whorls: rising, level, hanging
    for (let i = 0; i < p.count; i++) {
      const t = p.getX(i) / len;
      p.setXYZ(i, p.getX(i), p.getY(i) + Math.sin(lift) * t * len - t * t * len * 0.75, p.getZ(i) * (1 - t * 0.8));
    }
    g.deleteAttribute('uv');
    g.rotateY((k / n) * Math.PI * 2 + rng() * 0.3);
    g.translate(top.x, top.y, top.z);
    fronds.push(flat(g));
  }
  const heart = new IcosahedronGeometry(0.075, 0).translate(top.x, top.y - 0.04, top.z);
  heart.deleteAttribute('uv');
  fronds.push(flat(heart));
  const crown = finish(mergeGeometries(fronds, false)!, 0, H - 0.3, H + 0.4, top, 0.6);
  const t = finish(flat(trunkG), 1, 0, H * 1.6, null, 1);
  return mergeGeometries([t, crown], false)!;
}

function columnarGeo(seed: number) {
  const rng = mulberry32(seed);
  const t = trunk(0.38, 0.045, 0.032, 0, rng);
  const c = lobedCrown(rng, 1.05, 0.32, 4, 2.1);
  return mergeGeometries([flat(t), flat(c)], false)!;
}

function bushGeo(seed: number) {
  const rng = mulberry32(seed);
  const c = lobedCrown(rng, 0.16, 0.24, 4, 0.7);
  return flat(c);
}

/* ------------------------------------------------------------------ */
/* Material: wind sway, leafy breakup, baked AO, X-ray fade             */
/* ------------------------------------------------------------------ */

function createFoliageMaterial() {
  const mat = new MeshStandardMaterial({ color: '#ffffff', roughness: 0.82, metalness: 0, envMapIntensity: 0.6, transparent: true });
  return patchMaterial(mat, {
    key: 'foliage',
    uniforms: { uTime: G.uTime, uXray: G.uXray, uGhostColor: G.uGhostColor },
    vertexHead: /* glsl */ `
      uniform float uTime;
      attribute float aPart;
      attribute float aSway;
      attribute float aAO;
      varying float vPart;
      varying float vAO;
      varying vec3 vLeaf;
    `,
    vertexTransform: /* glsl */ `
      vPart = aPart;
      vAO = aAO;
      vLeaf = position * 6.0;
      #ifdef USE_INSTANCING
        vec3 ip = instanceMatrix[3].xyz;
      #else
        vec3 ip = vec3(0.0);
      #endif
      float ph = ip.x * 0.37 + ip.z * 0.53;
      float gust = 0.6 + 0.4 * sin(uTime * 0.31 + ip.x * 0.05);
      float s2 = aSway * aSway;
      transformed.x += (sin(uTime * 1.15 + ph) * 0.045 + sin(uTime * 2.9 + ph * 1.7 + position.y * 4.0) * 0.012) * s2 * gust;
      transformed.z += (cos(uTime * 0.95 + ph * 1.3) * 0.035 + cos(uTime * 3.3 + ph + position.x * 5.0) * 0.01) * s2 * gust;
    `,
    fragmentHead:
      /* glsl */ `
      uniform float uXray;
      uniform vec3 uGhostColor;
      varying float vPart;
      varying float vAO;
      varying vec3 vLeaf;
      float gFoliage;
    ` + GLSL_COMMON,
    fragmentColor: /* glsl */ `
      gFoliage = 1.0 - step(0.5, vPart);
      {
        float clump = gnoise(vLeaf.xy + vLeaf.z * 0.7) * 0.6 + gnoise(vLeaf.yz * 2.1) * 0.4;
        vec3 leaf = diffuseColor.rgb * (0.62 + 0.55 * clump) * (0.45 + 0.55 * vAO);
        vec3 bark = vec3(0.14, 0.11, 0.09) * (0.8 + 0.3 * gnoise(vLeaf.xy * 3.0));
        diffuseColor.rgb = mix(bark, leaf, gFoliage);
      }
    `,
    fragmentEmissive: /* glsl */ `
      // a touch of light through the leaves
      totalEmissiveRadiance += diffuseColor.rgb * 0.06 * gFoliage * vAO;
    `,
    fragmentOutput: /* glsl */ `
      {
        float fres = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), 2.0);
        outgoingLight = mix(outgoingLight, uGhostColor * (0.02 + fres * 0.3), uXray * 0.9);
        diffuseColor.a *= mix(1.0, 0.03 + fres * 0.1, uXray);
      }
    `,
  });
}

/* ------------------------------------------------------------------ */
/* Placement                                                           */
/* ------------------------------------------------------------------ */

type Kind = 0 | 1 | 2 | 3; // shade tree (neem / ghaf), date palm, clipped conocarpus, bush
interface Plant {
  kind: Kind;
  x: number;
  z: number;
  s: number;
  rot: number;
  color: Color;
}

const KEEP_CLEAR = [
  { minX: 30, maxX: 37.5, minZ: -7.5, maxZ: -4 }, // hospital emergency canopy
  { minX: 50.8, maxX: 54.2, minZ: 31, maxZ: 36 }, // depot gate
];

/** Irrigated desert greens: grey-green palm fronds, olive shade trees, dark clipped hedges. */
function leafColor(rng: Rng, kind: Kind) {
  const c = new Color();
  if (kind === 1) return c.setHSL(0.2 + rng() * 0.04, 0.28 + rng() * 0.1, 0.19 + rng() * 0.05);
  if (kind === 2) return c.setHSL(0.3 + rng() * 0.04, 0.38 + rng() * 0.1, 0.12 + rng() * 0.04);
  return c.setHSL(0.21 + rng() * 0.07, 0.3 + rng() * 0.14, 0.16 + rng() * 0.07);
}

function placePlants(): Plant[] {
  const rng = mulberry32(77);
  const out: Plant[] = [];
  const add = (kind: Kind, x: number, z: number, s: number) => {
    if (x > TRENCH.minX - 1 && x < TRENCH.maxX + 1 && Math.abs(z) < 4.9) return;
    if (KEEP_CLEAR.some((b) => x > b.minX && x < b.maxX && z > b.minZ && z < b.maxZ)) return;
    out.push({ kind, x, z, s, rot: rng() * Math.PI * 2, color: leafColor(rng, kind) });
  };

  // park: shade-tree groves and palms around the paths, hedging shrubs
  const park = SECTOR_BY_ID.get('C-12')!;
  for (let gx = -8.6; gx <= 8.6; gx += 2.6) {
    for (let gz = -8.6; gz <= 8.6; gz += 2.6) {
      if (rng() < 0.3) continue;
      const x = park.x + gx + (rng() - 0.5) * 1.4;
      const z = park.z + gz + (rng() - 0.5) * 1.4;
      if (Math.abs(x - park.x) < 2.4 && Math.abs(z - park.z) < 2.4) continue;
      const r = rng();
      const kind: Kind = r < 0.5 ? 0 : r < 0.86 ? 1 : 2;
      add(kind, x, z, 0.85 + rng() * 0.5);
    }
  }
  for (let k = 0; k < 26; k++) {
    const a = rng() * Math.PI * 2;
    const rr = 3 + rng() * 6;
    add(3, park.x + Math.cos(a) * rr, park.z + Math.sin(a) * rr, 0.9 + rng() * 0.8);
  }

  // street trees on the sidewalks of every built block, between the lamp posts
  for (const s of SECTORS) {
    if (s.kind === 'park' || s.kind === 'yard') continue;
    const off = 10.95;
    for (const a of [-8.7, -3.0, 3.0, 8.7]) {
      const jitter = (rng() - 0.5) * 0.3;
      const sc = () => 0.78 + rng() * 0.26;
      const kind = (): Kind => {
        const r = rng();
        return r < 0.62 ? 1 : r < 0.88 ? 0 : 2;
      };
      add(kind(), s.x + a + jitter, s.z - off, sc());
      add(kind(), s.x + a + jitter, s.z + off, sc());
      add(kind(), s.x - off, s.z + a + jitter, sc());
      add(kind(), s.x + off, s.z + a + jitter, sc());
    }
  }

  // Corniche promenade: an unbroken line of palms
  for (let x = -73; x <= 73; x += 4.4) {
    if (Math.abs(x % 10) < 1.2) continue;
    add(rng() < 0.85 ? 1 : 0, x + (rng() - 0.5), 65.7 + (rng() - 0.5) * 0.5, 0.86 + rng() * 0.3);
  }
  // mosque forecourt (D-12, Corniche side)
  for (const x of [-7.6, -4.6, -1.6, 1.4]) add(1, x, 52.4, 0.8 + rng() * 0.2);
  // campus + hospital grounds
  [
    [-36, -36],
    [-35, -51],
    [-20, -36],
    [-39, -45],
    [21, -24],
    [36, -24],
    [36, -8.5],
    [20.5, -8.5],
  ].forEach(([x, z]) => add(rng() < 0.7 ? 0 : 1, x, z, 0.85 + rng() * 0.3));
  return out;
}

/* ------------------------------------------------------------------ */

const KIND_GEOS: (() => BufferGeometry)[] = [() => deciduousGeo(11), () => palmGeo(23), () => columnarGeo(37), () => bushGeo(41)];

export function Vegetation() {
  const plants = useMemo(placePlants, []);
  const groups = useMemo(() => [0, 1, 2, 3].map((k) => plants.filter((p) => p.kind === k)), [plants]);
  const geos = useMemo(() => KIND_GEOS.map((f) => f()), []);
  const mat = useMemo(() => createFoliageMaterial(), []);
  const refs = useRef<(InstancedMesh | null)[]>([]);

  useLayoutEffect(() => {
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    groups.forEach((list, k) => {
      const mesh = refs.current[k];
      if (!mesh) return;
      list.forEach((p, i) => {
        q.setFromAxisAngle(up, p.rot);
        m.compose(new Vector3(p.x, PLINTH_H, p.z), q, new Vector3(p.s, p.s * (0.92 + (p.rot % 0.16)), p.s));
        mesh.setMatrixAt(i, m);
        mesh.setColorAt(i, p.color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
  }, [groups]);

  return (
    <group>
      {groups.map((list, k) => (
        <instancedMesh
          key={k}
          ref={(m) => {
            refs.current[k] = m;
          }}
          args={[geos[k], mat, Math.max(1, list.length)]}
          count={list.length}
          raycast={noRaycast}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}
