import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BoxGeometry, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3, type Intersection, type Material, type Raycaster } from 'three';
import { AD, AD_BUILDING_ID0, place, type AdBuilding } from '../data/abudhabi';
import { sectorAt } from '../data/city';
import { live } from '../simulation/runtime';
import { G } from './shaders/globals';
import { useTwinStore } from '../store/useTwinStore';
import { createBuildingGhostMaterial, createBuildingSolidMaterial } from './materials/buildingMaterials';
import { variantFor, variantGeometry, type VariantSpec } from './buildingVariants';
import { classifyBuildingPick } from '../data/warehouseRoofs';

const noRaycast = (_r: Raycaster, _i: Intersection[]) => {};

/** facade styles understood by the building shader */
const GLASS = 0;
const CONCRETE = 1;
const RESIDENTIAL = 2;
const RIBBON = 3;
const WARM = 4;
const INDUSTRIAL = 5;

type RGB = [number, number, number];
const CREAM: RGB[] = [
  [0.78, 0.74, 0.66],
  [0.82, 0.79, 0.72],
  [0.72, 0.66, 0.56],
  [0.66, 0.6, 0.5],
];
const SAND: RGB[] = [
  [0.68, 0.58, 0.44],
  [0.72, 0.64, 0.5],
  [0.62, 0.55, 0.45],
];
const GLASS_T: RGB[] = [
  [0.26, 0.36, 0.4],
  [0.3, 0.38, 0.44],
  [0.36, 0.39, 0.43],
  [0.42, 0.44, 0.46],
];
const WHITE: RGB = [0.92, 0.91, 0.88];
/** Gulf whites and beiges: lime-washed white, warm beige and light stone, as most UAE homes and low blocks are */
const WHITES: RGB[] = [
  [0.94, 0.93, 0.9],
  [0.9, 0.89, 0.85],
  [0.96, 0.95, 0.92],
];
const BEIGE: RGB[] = [
  [0.87, 0.79, 0.65],
  [0.84, 0.75, 0.6],
  [0.9, 0.84, 0.72],
  [0.8, 0.71, 0.56],
];
const STONE: RGB[] = [
  [0.88, 0.84, 0.76],
  [0.82, 0.77, 0.68],
];
/** homes and low blocks: about a third white, half beige, the rest stone or sand */
const homeTint = (r: number, r2: number): RGB => (r < 0.35 ? pick(WHITES, r2) : r < 0.82 ? pick(BEIGE, r2) : r < 0.93 ? pick(STONE, r2) : pick(SAND, r2));
/** sheds and halls: white or beige cladding, some grey */
const INDUSTRY_NAME = /Factory|Warehouse|warehouse|Workshop|Truck|depot|Plant|Substation|Loading/;
const industryTint = (r: number, r2: number): RGB => (r < 0.4 ? pick(WHITES, r2) : r < 0.75 ? pick(BEIGE, r2) : pick(CREAM, r2));

const hash = (n: number) => {
  const x = Math.sin(n * 91.3458 + 47.2) * 43758.5453;
  return x - Math.floor(x);
};
const pick = <T,>(list: T[], r: number) => list[Math.floor(r * list.length) % list.length];

function look(b: AdBuilding): { style: number; tint: RGB; lit: number } {
  const r = hash(b.id);
  const r2 = hash(b.id * 3.1 + 1);
  switch (b.k) {
    case 'tower':
    case 'hotel':
      return { style: r < 0.62 ? GLASS : RIBBON, tint: r < 0.62 ? pick(GLASS_T, r2) : pick(CREAM, r2), lit: 0.42 };
    case 'office':
      return { style: r < 0.5 ? CONCRETE : GLASS, tint: r < 0.5 ? homeTint(r2, r) : pick(GLASS_T, r2), lit: 0.34 };
    case 'mall':
      return { style: RIBBON, tint: pick(SAND, r2), lit: 0.5 };
    case 'mosque':
      return { style: RIBBON, tint: WHITE, lit: 0.2 };
    case 'hospital':
      return { style: CONCRETE, tint: WHITE, lit: 0.5 };
    case 'school':
      return { style: RESIDENTIAL, tint: pick(SAND, r2), lit: 0.25 };
    case 'fort':
      return { style: WARM, tint: [0.8, 0.72, 0.58], lit: 0.2 };
    case 'house':
      // villas: smooth lime plaster (not brick), mostly white or beige, a few sand
      return { style: CONCRETE, tint: r < 0.45 ? pick(WHITES, r2) : r < 0.9 ? pick(BEIGE, r2) : pick(SAND, r2), lit: 0.3 };
    case 'pool':
      return { style: RESIDENTIAL, tint: [0.36, 0.66, 0.82], lit: 0.45 };
    case 'utility':
    case 'roof':
      return { style: INDUSTRIAL, tint: [0.6, 0.59, 0.56], lit: 0.1 };
    case 'residential':
      return { style: r < 0.55 ? RESIDENTIAL : RIBBON, tint: homeTint(r2, r), lit: 0.38 };
    default:
      if (b.h > 9) return { style: r < 0.45 ? GLASS : RESIDENTIAL, tint: r < 0.45 ? pick(GLASS_T, r2) : homeTint(r2, r), lit: 0.36 };
      if (INDUSTRY_NAME.test(b.n)) return { style: RESIDENTIAL, tint: industryTint(r2, r), lit: 0.3 };
      return { style: RESIDENTIAL, tint: homeTint(r2, r), lit: 0.32 };
  }
}

/** Box edges within reach of a main road get lit shopfronts on the ground floor. */
const MAIN = AD.roads.filter((r) => /^(trunk|primary|secondary)$/.test(r.c) && !r.t);
function onMainStreet([x1, z1, x2, z2]: [number, number, number, number]) {
  for (const r of MAIN) {
    for (let i = 1; i < r.p.length; i++) {
      const [ax, az] = r.p[i - 1];
      const [bx, bz] = r.p[i];
      const L2 = (bx - ax) ** 2 + (bz - az) ** 2 || 1e-9;
      const cx = Math.max(x1, Math.min(x2, (ax + bx) / 2));
      const cz = Math.max(z1, Math.min(z2, (az + bz) / 2));
      const t = Math.max(0, Math.min(1, ((cx - ax) * (bx - ax) + (cz - az) * (bz - az)) / L2));
      const px = ax + t * (bx - ax);
      const pz = az + t * (bz - az);
      const dx = Math.max(x1 - px, 0, px - x2);
      const dz = Math.max(z1 - pz, 0, pz - z2);
      if (Math.hypot(dx, dz) < r.w / 2 + 1.4) return true;
    }
  }
  return false;
}

const HOSPITAL = place('hospital');
const SCHOOL = place('school');
const SHOP_KINDS = new Set(['building', 'residential', 'office', 'mall', 'hotel', 'tower']);

export function AbuDhabiBuildings() {
  // baseline buildings keep their box shells; procedural expansion buildings use the variant catalogue
  const boxes = useMemo(() => AD.buildings.flatMap((b, bi) => (b.procedural ? [] : b.b.map((box) => ({ b, bi, box })))), []);

  const geometry = useMemo(() => {
    const g = new BoxGeometry(1, 1, 1);
    g.translate(0, 0.5, 0);
    const n = boxes.length;
    const aSeed = new Float32Array(n);
    const aBldg = new Float32Array(n);
    const aStyle = new Float32Array(n);
    const aLit = new Float32Array(n);
    const aPoi = new Float32Array(n);
    const aShop = new Float32Array(n);
    const aTint = new Float32Array(n * 3);
    const aCenter = new Float32Array(n * 2);
    const looks = AD.buildings.map(look);
    boxes.forEach(({ b, bi, box }, i) => {
      const lk = looks[bi];
      aSeed[i] = ((b.id * 0.618034) % 1) * 9.7 + 0.3;
      aBldg[i] = AD_BUILDING_ID0 + bi;
      aStyle[i] = lk.style;
      aLit[i] = lk.lit;
      aPoi[i] = (HOSPITAL && b.n === HOSPITAL.n) || (SCHOOL && b.n === SCHOOL.n) ? 1 : 0;
      aShop[i] = SHOP_KINDS.has(b.k) && b.y === 0 && onMainStreet(box) ? 1 : 0;
      aTint.set(lk.tint, i * 3);
      aCenter.set(b.c, i * 2);
    });
    g.setAttribute('aSeed', new InstancedBufferAttribute(aSeed, 1));
    g.setAttribute('aBldg', new InstancedBufferAttribute(aBldg, 1));
    g.setAttribute('aStyle', new InstancedBufferAttribute(aStyle, 1));
    g.setAttribute('aLit', new InstancedBufferAttribute(aLit, 1));
    g.setAttribute('aPoi', new InstancedBufferAttribute(aPoi, 1));
    g.setAttribute('aShop', new InstancedBufferAttribute(aShop, 1));
    g.setAttribute('aTint', new InstancedBufferAttribute(aTint, 3));
    g.setAttribute('aCenter', new InstancedBufferAttribute(aCenter, 2));
    return g;
  }, [boxes]);

  const solidMat = useMemo(() => createBuildingSolidMaterial(), []);
  const ghostMat = useMemo(() => createBuildingGhostMaterial(), []);
  const solidRef = useRef<InstancedMesh>(null);
  const ghostRef = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const solid = solidRef.current!;
    const ghost = ghostRef.current!;
    const m = new Matrix4();
    const q = new Quaternion();
    boxes.forEach(({ b, box: [x1, z1, x2, z2] }, i) => {
      m.compose(new Vector3((x1 + x2) / 2, b.y, (z1 + z2) / 2), q, new Vector3(x2 - x1, b.h, z2 - z1));
      solid.setMatrixAt(i, m);
    });
    solid.instanceMatrix.needsUpdate = true;
    ghost.instanceMatrix = solid.instanceMatrix;
    solid.computeBoundingSphere();
    ghost.computeBoundingSphere();
  }, [boxes]);

  useFrame(() => {
    const solid = solidRef.current;
    const ghost = ghostRef.current;
    if (!solid || !ghost) return;
    const gx = G.uXray.value;
    solid.visible = gx < 0.995;
    ghost.visible = gx > 0.004;
    solidMat.depthWrite = gx < 0.55;
    // Opaque while the city is solid, so the renderer depth-sorts it with the other opaque meshes.
    // Transparent only during the X-ray fade. Keeping it transparent all the time sorts the whole
    // instanced mesh as one object, which let the transparent pass draw over the Tasheel Centre mall.
    solidMat.transparent = gx > 0.001;
    solid.castShadow = gx < 0.5;
    solid.raycast = gx > 0.5 || live.exploded > 0.3 ? noRaycast : InstancedMesh.prototype.raycast;
  });

  const setHover = useTwinStore((s) => s.setHover);
  const setHoverSector = useTwinStore((s) => s.setHoverSector);
  const select = useTwinStore((s) => s.select);

  return (
    <group>
      <instancedMesh
        ref={solidRef}
        args={[geometry, solidMat, boxes.length]}
        castShadow
        receiveShadow
        onPointerMove={(e) => {
          if (e.instanceId === undefined) return;
          e.stopPropagation();
          const { b, bi } = boxes[e.instanceId];
          const pick = classifyBuildingPick(b, e.point.y);
          setHover(pick.kind === 'roof' ? { kind: 'roof', id: pick.id } : { kind: 'building', id: AD_BUILDING_ID0 + bi });
          setHoverSector(sectorAt(b.c[0], b.c[1])?.id ?? null);
        }}
        onPointerOut={() => setHover(null)}
        onClick={(e) => {
          if (e.delta > 4 || e.instanceId === undefined) return;
          e.stopPropagation();
          const { b, bi } = boxes[e.instanceId];
          const pick = classifyBuildingPick(b, e.point.y);
          const info = pick.kind === 'roof' ? ({ kind: 'roof', id: pick.id } as const) : ({ kind: 'building', id: AD_BUILDING_ID0 + bi } as const);
          select({ info, point: [e.point.x, e.point.y, e.point.z] });
        }}
      />
      <instancedMesh ref={ghostRef} args={[geometry, ghostMat, boxes.length]} frustumCulled={false} raycast={noRaycast} renderOrder={5} />
      <VariantBuildings solidMat={solidMat} ghostMat={ghostMat} />
    </group>
  );
}

/** One instanced mesh per catalogue variant, for the procedural expansion buildings. */
function VariantBuildings({ solidMat, ghostMat }: { solidMat: Material; ghostMat: Material }) {
  const groups = useMemo(() => {
    const map = new Map<number, { spec: VariantSpec; items: { b: AdBuilding; bi: number }[] }>();
    AD.buildings.forEach((b, bi) => {
      if (!b.procedural || b.b.length === 0) return;
      const spec = variantFor(b);
      const g = map.get(spec.id) ?? { spec, items: [] };
      g.items.push({ b, bi });
      map.set(spec.id, g);
    });
    return [...map.values()].sort((a, b) => a.spec.id - b.spec.id);
  }, []);
  return (
    <>
      {groups.map((g) => (
        <VariantMesh key={g.spec.id} spec={g.spec} items={g.items} solidMat={solidMat} ghostMat={ghostMat} />
      ))}
    </>
  );
}

function VariantMesh({ spec, items, solidMat, ghostMat }: { spec: VariantSpec; items: { b: AdBuilding; bi: number }[]; solidMat: Material; ghostMat: Material }) {
  const solidRef = useRef<InstancedMesh>(null);
  const ghostRef = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => {
    const g = variantGeometry(spec);
    const n = items.length;
    const aSeed = new Float32Array(n);
    const aBldg = new Float32Array(n);
    const aStyle = new Float32Array(n);
    const aLit = new Float32Array(n);
    const aPoi = new Float32Array(n);
    const aShop = new Float32Array(n);
    const aTint = new Float32Array(n * 3);
    const aCenter = new Float32Array(n * 2);
    items.forEach(({ b, bi }, i) => {
      const lk = look(b);
      aSeed[i] = ((b.id * 0.618034) % 1) * 9.7 + 0.3;
      aBldg[i] = AD_BUILDING_ID0 + bi;
      aStyle[i] = lk.style;
      aLit[i] = lk.lit;
      aPoi[i] = 0;
      aShop[i] = SHOP_KINDS.has(b.k) && b.y === 0 && onMainStreet(b.b[0]) ? 1 : 0;
      aTint.set(lk.tint, i * 3);
      aCenter.set(b.c, i * 2);
    });
    g.setAttribute('aSeed', new InstancedBufferAttribute(aSeed, 1));
    g.setAttribute('aBldg', new InstancedBufferAttribute(aBldg, 1));
    g.setAttribute('aStyle', new InstancedBufferAttribute(aStyle, 1));
    g.setAttribute('aLit', new InstancedBufferAttribute(aLit, 1));
    g.setAttribute('aPoi', new InstancedBufferAttribute(aPoi, 1));
    g.setAttribute('aShop', new InstancedBufferAttribute(aShop, 1));
    g.setAttribute('aTint', new InstancedBufferAttribute(aTint, 3));
    g.setAttribute('aCenter', new InstancedBufferAttribute(aCenter, 2));
    return g;
  }, [spec, items]);

  useLayoutEffect(() => {
    const solid = solidRef.current!;
    const ghost = ghostRef.current!;
    const m = new Matrix4();
    const q = new Quaternion();
    items.forEach(({ b }, i) => {
      const [x1, z1, x2, z2] = b.b[0];
      m.compose(new Vector3((x1 + x2) / 2, b.y, (z1 + z2) / 2), q, new Vector3(x2 - x1, b.h, z2 - z1));
      solid.setMatrixAt(i, m);
    });
    solid.instanceMatrix.needsUpdate = true;
    ghost.instanceMatrix = solid.instanceMatrix;
    solid.computeBoundingSphere();
    ghost.computeBoundingSphere();
  }, [items]);

  useFrame(() => {
    const solid = solidRef.current;
    const ghost = ghostRef.current;
    if (!solid || !ghost) return;
    const gx = G.uXray.value;
    solid.visible = gx < 0.995;
    ghost.visible = gx > 0.004;
    solid.castShadow = gx < 0.5;
    solid.raycast = gx > 0.5 || live.exploded > 0.3 ? noRaycast : InstancedMesh.prototype.raycast;
  });

  const setHover = useTwinStore((s) => s.setHover);
  const setHoverSector = useTwinStore((s) => s.setHoverSector);
  const select = useTwinStore((s) => s.select);

  return (
    <group>
      <instancedMesh
        ref={solidRef}
        args={[geometry, solidMat, items.length]}
        castShadow
        receiveShadow
        onPointerMove={(e) => {
          if (e.instanceId === undefined) return;
          e.stopPropagation();
          const { b, bi } = items[e.instanceId];
          const pick = classifyBuildingPick(b, e.point.y);
          setHover(pick.kind === 'roof' ? { kind: 'roof', id: pick.id } : { kind: 'building', id: AD_BUILDING_ID0 + bi });
          setHoverSector(sectorAt(b.c[0], b.c[1])?.id ?? null);
        }}
        onPointerOut={() => setHover(null)}
        onClick={(e) => {
          if (e.delta > 4 || e.instanceId === undefined) return;
          e.stopPropagation();
          const { b, bi } = items[e.instanceId];
          const pick = classifyBuildingPick(b, e.point.y);
          const info = pick.kind === 'roof' ? ({ kind: 'roof', id: pick.id } as const) : ({ kind: 'building', id: AD_BUILDING_ID0 + bi } as const);
          select({ info, point: [e.point.x, e.point.y, e.point.z] });
        }}
      />
      <instancedMesh ref={ghostRef} args={[geometry, ghostMat, items.length]} frustumCulled={false} raycast={noRaycast} renderOrder={5} />
    </group>
  );
}
