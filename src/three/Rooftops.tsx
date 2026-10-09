import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BoxGeometry, Color, ConeGeometry, CylinderGeometry, InstancedMesh, Matrix4, Quaternion, SphereGeometry, Vector3, type Intersection, type Raycaster } from 'three';
import { BUILDINGS, PLINTH_H, STYLE, type Tier } from '../data/city';
import { mulberry32, type Rng } from '../data/rng';
import { G } from './shaders/globals';
import { createGlowMaterial, createPropMaterial } from './materials/surfaceMaterials';

const noRaycast = (_r: Raycaster, _i: Intersection[]) => {};

/** One instanced box/cylinder: centre, size, yaw, colour. */
interface Inst {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rx?: number;
  ry?: number;
  c: Color;
}

interface Rect {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
}

const tierTop = (t: Tier) => t.y0 + t.h + PLINTH_H;

/** Simple rejection packing so equipment never overlaps on a roof. */
class RoofPlan {
  used: Rect[] = [];
  constructor(
    public t: Tier,
    public inset: number,
  ) {}
  place(rng: Rng, w: number, d: number, tries = 14): { x: number; z: number } | null {
    const { t, inset } = this;
    const hw = t.w / 2 - inset - w / 2;
    const hd = t.d / 2 - inset - d / 2;
    if (hw < 0 || hd < 0) return null;
    for (let k = 0; k < tries; k++) {
      const x = t.x + (rng() * 2 - 1) * hw;
      const z = t.z + (rng() * 2 - 1) * hd;
      const r = { x0: x - w / 2 - 0.08, x1: x + w / 2 + 0.08, z0: z - d / 2 - 0.08, z1: z + d / 2 + 0.08 };
      if (this.used.some((u) => r.x0 < u.x1 && r.x1 > u.x0 && r.z0 < u.z1 && r.z1 > u.z0)) continue;
      this.used.push(r);
      return { x, z };
    }
    return null;
  }
}

interface Roofscape {
  parapets: Inst[];
  cores: Inst[];
  hvac: Inst[];
  fans: Inst[];
  barrels: Inst[];
  cones: Inst[];
  legs: Inst[];
  solar: Inst[];
  green: Inst[];
  shrubs: Inst[];
  masts: Inst[];
  beacons: Inst[];
  pads: Inst[];
}

function buildRoofscape(): Roofscape {
  const rng = mulberry32(6061);
  const R: Roofscape = { parapets: [], cores: [], hvac: [], fans: [], barrels: [], cones: [], legs: [], solar: [], green: [], shrubs: [], masts: [], beacons: [], pads: [] };
  const metal = () => new Color().setHSL(0.58, 0.04, 0.42 + rng() * 0.16);
  const tallest = [...BUILDINGS].filter((b) => !b.special).sort((a, b) => b.height - a.height)[0];

  const addParapets = (t: Tier, tint: Color) => {
    const y = tierTop(t);
    const ph = 0.11;
    const th = 0.05;
    R.parapets.push({ x: t.x, y: y + ph / 2, z: t.z - t.d / 2 + th / 2, sx: t.w, sy: ph, sz: th, c: tint });
    R.parapets.push({ x: t.x, y: y + ph / 2, z: t.z + t.d / 2 - th / 2, sx: t.w, sy: ph, sz: th, c: tint });
    R.parapets.push({ x: t.x - t.w / 2 + th / 2, y: y + ph / 2, z: t.z, sx: th, sy: ph, sz: t.d - th * 2, c: tint });
    R.parapets.push({ x: t.x + t.w / 2 - th / 2, y: y + ph / 2, z: t.z, sx: th, sy: ph, sz: t.d - th * 2, c: tint });
  };

  const hvacUnit = (plan: RoofPlan, y: number) => {
    const w = 0.34 + rng() * 0.26;
    const d = 0.28 + rng() * 0.2;
    const h = 0.16 + rng() * 0.1;
    const p = plan.place(rng, w, d);
    if (!p) return;
    R.hvac.push({ x: p.x, y: y + h / 2, z: p.z, sx: w, sy: h, sz: d, c: metal() });
    const fans = w > 0.48 ? 2 : 1;
    for (let f = 0; f < fans; f++) {
      const fx = fans === 2 ? p.x + (f ? 0.13 : -0.13) * (w / 0.6) : p.x;
      R.fans.push({ x: fx, y: y + h + 0.012, z: p.z, sx: Math.min(0.11, d * 0.38), sy: 0.024, sz: Math.min(0.11, d * 0.38), c: new Color('#202429') });
    }
  };

  const waterTower = (plan: RoofPlan, y: number) => {
    const r = 0.26 + rng() * 0.08;
    const p = plan.place(rng, r * 2.4, r * 2.4);
    if (!p) return;
    const legH = 0.24;
    const bh = 0.48 + rng() * 0.12;
    const wood = new Color().setHSL(0.07, 0.35, 0.2 + rng() * 0.06);
    for (const [dx, dz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      R.legs.push({ x: p.x + dx * r * 0.6, y: y + legH / 2, z: p.z + dz * r * 0.6, sx: 0.035, sy: legH, sz: 0.035, c: new Color('#2a2c30') });
    R.barrels.push({ x: p.x, y: y + legH + bh / 2, z: p.z, sx: r, sy: bh, sz: r, c: wood });
    R.cones.push({ x: p.x, y: y + legH + bh + 0.1, z: p.z, sx: r * 1.08, sy: 0.2, sz: r * 1.08, c: new Color('#2b2f35') });
  };

  const solarArray = (t: Tier, y: number, plan: RoofPlan) => {
    const rows = Math.floor((t.d - 1.0) / 0.62);
    const width = Math.min(t.w - 0.9, 3.2);
    if (rows < 1 || width < 0.8) return;
    const used = Math.min(rows, 2 + Math.floor(rng() * 3));
    const blk = plan.place(rng, width + 0.1, used * 0.62 + 0.1, 3);
    if (!blk) return;
    for (let k = 0; k < used; k++) {
      const panels = Math.max(1, Math.floor(width / 0.52));
      for (let i = 0; i < panels; i++) {
        const px = blk.x - width / 2 + (i + 0.5) * (width / panels);
        R.solar.push({ x: px, y: y + 0.09, z: blk.z - (used * 0.62) / 2 + 0.31 + k * 0.62, sx: width / panels - 0.03, sy: 0.025, sz: 0.42, rx: -0.42, c: new Color('#0d1a2e') });
      }
    }
  };

  const garden = (plan: RoofPlan, y: number, t: Tier) => {
    const w = Math.min(t.w * 0.45, 2.6);
    const d = Math.min(t.d * 0.38, 2.2);
    const p = plan.place(rng, w, d);
    if (!p) return;
    R.green.push({ x: p.x, y: y + 0.04, z: p.z, sx: w, sy: 0.08, sz: d, c: new Color().setHSL(0.27, 0.4, 0.16 + rng() * 0.04) });
    const n = 3 + Math.floor(rng() * 4);
    for (let k = 0; k < n; k++) {
      const s = 0.12 + rng() * 0.12;
      R.shrubs.push({ x: p.x + (rng() - 0.5) * (w - 0.3), y: y + 0.08 + s * 0.6, z: p.z + (rng() - 0.5) * (d - 0.3), sx: s, sy: s * 0.9, sz: s, c: new Color().setHSL(0.25 + rng() * 0.08, 0.42, 0.15 + rng() * 0.07) });
    }
  };

  for (const b of BUILDINGS) {
    const tint = new Color(b.tint[0], b.tint[1], b.tint[2]).multiplyScalar(0.92);
    b.tiers.forEach((t) => addParapets(t, tint));
    if (b.special) {
      for (const it of b.roof)
        if (it.type === 'spire') {
          R.masts.push({ x: it.x, y: it.y0 + PLINTH_H + it.h / 2, z: it.z, sx: 0.06, sy: it.h, sz: 0.06, c: new Color('#8a93a3') });
          R.beacons.push({ x: it.x, y: it.y0 + PLINTH_H + it.h + 0.06, z: it.z, sx: 1, sy: 1, sz: 1, c: new Color() });
        }
      continue;
    }
    const top = b.tiers[b.tiers.length - 1];
    const y = tierTop(top);
    const plan = new RoofPlan(top, 0.3);
    const area = top.w * top.d;

    // helipad on the tallest tower
    if (b === tallest && top.w > 3.4 && top.d > 3.4) {
      plan.used.push({ x0: top.x - 1.6, x1: top.x + 1.6, z0: top.z - 1.6, z1: top.z + 1.6 });
      R.pads.push({ x: top.x, y: y + 0.05, z: top.z, sx: 1.45, sy: 0.1, sz: 1.45, c: new Color('#23282f') });
    }
    // lift / stair core
    if (b.height > 4.5 && rng() < 0.85) {
      const w = top.w * (0.2 + rng() * 0.14);
      const d = top.d * (0.18 + rng() * 0.14);
      const h = 0.32 + rng() * 0.3;
      const p = plan.place(rng, w, d);
      if (p) R.cores.push({ x: p.x, y: y + h / 2, z: p.z, sx: w, sy: h, sz: d, c: tint.clone().multiplyScalar(0.82) });
    }
    // mechanical plant
    const units = Math.min(7, 1 + Math.floor(area / 14));
    for (let k = 0; k < units; k++) hvacUnit(plan, y);
    // water tower on older residential / brick roofs
    if ((b.style === STYLE.residential || b.style === STYLE.warm) && b.height > 3.5 && b.height < 14 && rng() < 0.45) waterTower(plan, y);
    // solar on low-rise roofs
    if (b.height < 8 && area > 22 && rng() < 0.6) solarArray(top, y, plan);
    // roof garden
    if ((b.kind === 'residential' || b.kind === 'mixed') && b.height < 13 && area > 18 && rng() < 0.4) garden(plan, y, top);
    // antennas
    for (const it of b.roof)
      if (it.type === 'spire') {
        R.masts.push({ x: it.x, y: it.y0 + PLINTH_H + it.h / 2, z: it.z, sx: 0.07, sy: it.h, sz: 0.07, c: new Color('#8a93a3') });
        R.beacons.push({ x: it.x, y: it.y0 + PLINTH_H + it.h + 0.06, z: it.z, sx: 1, sy: 1, sz: 1, c: new Color() });
      }
    if (b.height > 11 && rng() < 0.45) {
      const p = plan.place(rng, 0.2, 0.2);
      if (p) {
        const h = 0.9 + rng() * 1.3;
        R.masts.push({ x: p.x, y: y + h / 2, z: p.z, sx: 0.035, sy: h, sz: 0.035, c: new Color('#7d8693') });
        R.beacons.push({ x: p.x, y: y + h + 0.05, z: p.z, sx: 0.7, sy: 0.7, sz: 0.7, c: new Color() });
      }
    }
    // setback terraces on lower tiers: a few planters
    b.tiers.slice(0, -1).forEach((t) => {
      if (rng() < 0.5) return;
      const tp = new RoofPlan(t, 0.25);
      const above = b.tiers[b.tiers.indexOf(t) + 1];
      tp.used.push({ x0: above.x - above.w / 2, x1: above.x + above.w / 2, z0: above.z - above.d / 2, z1: above.z + above.d / 2 });
      for (let k = 0; k < 3; k++) {
        const s = 0.14 + rng() * 0.1;
        const p = tp.place(rng, s * 2, s * 2, 6);
        if (p) R.shrubs.push({ x: p.x, y: tierTop(t) + s * 0.7, z: p.z, sx: s, sy: s, sz: s, c: new Color().setHSL(0.27 + rng() * 0.06, 0.4, 0.16) });
      }
    });
  }
  return R;
}

function useInstances(ref: React.RefObject<InstancedMesh | null>, list: Inst[]) {
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const m = new Matrix4();
    const q = new Quaternion();
    const e = new Vector3();
    list.forEach((it, i) => {
      q.setFromAxisAngle(e.set(1, 0, 0), it.rx ?? 0);
      if (it.ry) q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), it.ry));
      m.compose(new Vector3(it.x, it.y, it.z), q, new Vector3(it.sx, it.sy, it.sz));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, it.c);
    });
    mesh.count = list.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [ref, list]);
}

export function Rooftops() {
  const R = useMemo(buildRoofscape, []);
  const box = useMemo(() => new BoxGeometry(1, 1, 1), []);
  const cyl = useMemo(() => new CylinderGeometry(1, 1, 1, 14), []);
  const cone = useMemo(() => new ConeGeometry(1, 1, 14), []);
  const sphere = useMemo(() => new SphereGeometry(1, 10, 8), []);
  const beaconGeo = useMemo(() => new SphereGeometry(0.075, 8, 6), []);

  const tinted = useMemo(() => createPropMaterial({ color: '#ffffff', roughness: 0.82, metalness: 0.02 }), []);
  const metalMat = useMemo(() => createPropMaterial({ color: '#ffffff', roughness: 0.45, metalness: 0.65 }), []);
  const solarMat = useMemo(() => createPropMaterial({ color: '#ffffff', roughness: 0.18, metalness: 0.7, envMapIntensity: 1.4 }), []);
  const greenMat = useMemo(() => createPropMaterial({ color: '#ffffff', roughness: 0.9, metalness: 0 }), []);
  const padMat = useMemo(() => createPropMaterial({ color: '#ffffff', roughness: 0.7, metalness: 0.1 }), []);
  const padMark = useMemo(() => createGlowMaterial('#f2f5f8', 1.3, 0.2), []);
  const beaconMat = useMemo(() => createGlowMaterial('#ff3b30', 6, 0.5), []);

  const refs = {
    parapets: useRef<InstancedMesh>(null),
    cores: useRef<InstancedMesh>(null),
    hvac: useRef<InstancedMesh>(null),
    fans: useRef<InstancedMesh>(null),
    barrels: useRef<InstancedMesh>(null),
    cones: useRef<InstancedMesh>(null),
    legs: useRef<InstancedMesh>(null),
    solar: useRef<InstancedMesh>(null),
    green: useRef<InstancedMesh>(null),
    shrubs: useRef<InstancedMesh>(null),
    masts: useRef<InstancedMesh>(null),
    beacons: useRef<InstancedMesh>(null),
    pads: useRef<InstancedMesh>(null),
  };
  useInstances(refs.parapets, R.parapets);
  useInstances(refs.cores, R.cores);
  useInstances(refs.hvac, R.hvac);
  useInstances(refs.fans, R.fans);
  useInstances(refs.barrels, R.barrels);
  useInstances(refs.cones, R.cones);
  useInstances(refs.legs, R.legs);
  useInstances(refs.solar, R.solar);
  useInstances(refs.green, R.green);
  useInstances(refs.shrubs, R.shrubs);
  useInstances(refs.masts, R.masts);
  useInstances(refs.beacons, R.beacons);
  useInstances(refs.pads, R.pads);

  const pad = R.pads[0];
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const on = (Math.sin(t * 2.6) > 0.55 ? 1 : 0.06) * (1 - G.uXray.value * 0.6);
    beaconMat.color.setRGB(6 * on, 0.35 * on, 0.3 * on);
    const cast = G.uXray.value < 0.5;
    for (const r of [refs.parapets, refs.cores, refs.hvac, refs.barrels]) if (r.current) r.current.castShadow = cast;
  });

  const n = (l: Inst[]) => Math.max(1, l.length);
  return (
    <group>
      <instancedMesh ref={refs.parapets} args={[box, tinted, n(R.parapets)]} raycast={noRaycast} castShadow receiveShadow />
      <instancedMesh ref={refs.cores} args={[box, tinted, n(R.cores)]} raycast={noRaycast} castShadow receiveShadow />
      <instancedMesh ref={refs.hvac} args={[box, metalMat, n(R.hvac)]} raycast={noRaycast} castShadow receiveShadow />
      <instancedMesh ref={refs.fans} args={[cyl, tinted, n(R.fans)]} raycast={noRaycast} />
      <instancedMesh ref={refs.barrels} args={[cyl, tinted, n(R.barrels)]} raycast={noRaycast} castShadow />
      <instancedMesh ref={refs.cones} args={[cone, tinted, n(R.cones)]} raycast={noRaycast} castShadow />
      <instancedMesh ref={refs.legs} args={[box, metalMat, n(R.legs)]} raycast={noRaycast} />
      <instancedMesh ref={refs.solar} args={[box, solarMat, n(R.solar)]} raycast={noRaycast} receiveShadow />
      <instancedMesh ref={refs.green} args={[box, greenMat, n(R.green)]} raycast={noRaycast} receiveShadow />
      <instancedMesh ref={refs.shrubs} args={[sphere, greenMat, n(R.shrubs)]} raycast={noRaycast} castShadow />
      <instancedMesh ref={refs.masts} args={[box, metalMat, n(R.masts)]} raycast={noRaycast} castShadow />
      <instancedMesh ref={refs.beacons} args={[beaconGeo, beaconMat, n(R.beacons)]} raycast={noRaycast} />
      <instancedMesh ref={refs.pads} args={[cyl, padMat, n(R.pads)]} raycast={noRaycast} receiveShadow />
      {pad && (
        <group position={[pad.x, pad.y + 0.055, pad.z]}>
          <mesh rotation-x={-Math.PI / 2} material={padMark}>
            <ringGeometry args={[1.2, 1.3, 48]} />
          </mesh>
          <mesh position={[-0.3, 0.005, 0]} material={padMark}>
            <boxGeometry args={[0.12, 0.01, 0.85]} />
          </mesh>
          <mesh position={[0.3, 0.005, 0]} material={padMark}>
            <boxGeometry args={[0.12, 0.01, 0.85]} />
          </mesh>
          <mesh position={[0, 0.005, 0]} material={padMark}>
            <boxGeometry args={[0.6, 0.01, 0.12]} />
          </mesh>
        </group>
      )}
    </group>
  );
}
