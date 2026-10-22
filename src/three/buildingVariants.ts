import { BoxGeometry, BufferGeometry, CylinderGeometry, ExtrudeGeometry, Shape, SphereGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { AdBuilding } from '../data/abudhabi';

/**
 * Procedural building catalogue for the expansion districts.
 *
 * A variant is a combination of an archetype (footprint plan), a roof form and an
 * add-on (canopy, loading bays, balconies, minaret, fins). Each variant is one merged
 * unit geometry: x and z in [-0.5, 0.5] (the footprint), y in [0, 1] (the height), so it
 * scales to any building in the same way the box shells do. The variant set is generated
 * from the lists below in a fixed order, so rebuilding the data never reshuffles them.
 */

export const ARCHETYPES = ['block', 'L', 'courtyard', 'stepped', 'tower', 'hall', 'villa', 'cross'] as const;
export const ROOFS = ['flat', 'parapet', 'gable', 'hip', 'sawtooth', 'dome'] as const;
export const ADDONS = ['none', 'canopy', 'bays', 'balconies', 'minaret', 'fins'] as const;

export type Archetype = (typeof ARCHETYPES)[number];
export type Roof = (typeof ROOFS)[number];
export type Addon = (typeof ADDONS)[number];

export interface VariantSpec {
  id: number;
  arch: Archetype;
  roof: Roof;
  addon: Addon;
}

/** Which combinations are buildable and sensible. */
function valid(arch: Archetype, roof: Roof, addon: Addon): boolean {
  if (roof === 'sawtooth' && arch !== 'hall') return false;
  if (roof === 'dome' && arch !== 'block' && arch !== 'cross') return false;
  if (roof === 'gable' && (arch === 'tower' || arch === 'cross' || arch === 'stepped')) return false;
  if (addon === 'minaret' && roof !== 'dome') return false;
  if (addon === 'bays' && arch !== 'hall' && arch !== 'block' && arch !== 'L') return false;
  if (addon === 'fins' && arch !== 'tower' && arch !== 'stepped') return false;
  if (arch === 'villa' && (roof === 'sawtooth' || roof === 'dome')) return false;
  return true;
}

/** Target count of the catalogue. The generator checks it; see countCatalogue(). */
export const CATALOGUE_TARGET = 75;

export const VARIANTS: VariantSpec[] = (() => {
  const out: VariantSpec[] = [];
  for (const arch of ARCHETYPES)
    for (const roof of ROOFS)
      for (const addon of ADDONS) if (valid(arch, roof, addon)) out.push({ id: out.length, arch, roof, addon });
  return out;
})();

export const countCatalogue = () => VARIANTS.length;

/* ---------- geometry helpers (unit space) ---------- */

type Vol = [number, number, number, number, number]; // x0, z0, x1, z1, height fraction

function plan(arch: Archetype): Vol[] {
  switch (arch) {
    case 'block':
      return [[-0.5, -0.5, 0.5, 0.5, 1]];
    case 'L':
      return [
        [-0.5, -0.5, 0.5, 0, 1],
        [-0.5, 0, 0, 0.5, 1],
      ];
    case 'courtyard':
      return [
        [-0.5, -0.5, 0.5, -0.25, 1],
        [-0.5, -0.25, -0.25, 0.5, 1],
        [0.25, -0.25, 0.5, 0.5, 1],
        [-0.25, 0.25, 0.25, 0.5, 1],
      ];
    case 'stepped':
      return [
        [-0.5, -0.5, 0.5, 0.5, 0.55],
        [-0.36, -0.36, 0.36, 0.36, 1],
      ];
    case 'tower':
      return [
        [-0.5, -0.5, 0.5, 0.5, 0.28],
        [-0.26, -0.26, 0.26, 0.26, 1],
      ];
    case 'hall':
      return [[-0.5, -0.36, 0.5, 0.36, 1]];
    case 'villa':
      return [
        [-0.5, -0.5, -0.04, 0.5, 0.74],
        [0.04, -0.2, 0.5, 0.2, 0.9],
      ];
    case 'cross':
      return [
        [-0.2, -0.5, 0.2, 0.5, 1],
        [-0.5, -0.2, 0.5, 0.2, 1],
      ];
  }
}

/** Flatten to non-indexed triangles only when the geometry is indexed (toNonIndexed warns otherwise). */
const flat = (g: BufferGeometry): BufferGeometry => (g.index ? g.toNonIndexed() : g);

function box(x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): BufferGeometry {
  const g = new BoxGeometry(x1 - x0, y1 - y0, z1 - z0);
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return flat(g);
}

/** Gable: a triangular prism whose ridge runs along x, over the footprint of a volume. */
function gable(x0: number, z0: number, x1: number, z1: number, y0: number, rise: number): BufferGeometry {
  const s = new Shape();
  const d = (z1 - z0) / 2;
  s.moveTo(-d, 0);
  s.lineTo(d, 0);
  s.lineTo(0, rise);
  s.closePath();
  const g = new ExtrudeGeometry(s, { depth: x1 - x0, bevelEnabled: false, curveSegments: 1 });
  g.rotateY(-Math.PI / 2); // extrusion now runs from x = -(x1 - x0) to 0
  g.translate(x1, y0, (z0 + z1) / 2);
  return flat(g);
}

/** Hip roof: a four-sided pyramid over a volume. */
function hip(x0: number, z0: number, x1: number, z1: number, y0: number, rise: number): BufferGeometry {
  const g = new CylinderGeometry(0, Math.hypot(x1 - x0, z1 - z0) / 2, rise, 4, 1);
  g.rotateY(Math.PI / 4);
  g.scale(Math.SQRT1_2 * 1.4, 1, Math.SQRT1_2 * 1.4);
  g.translate((x0 + x1) / 2, y0 + rise / 2, (z0 + z1) / 2);
  return flat(g);
}

/** Mosque dome: a half sphere on the centre of a volume. */
function dome(cx: number, cz: number, y0: number, r: number): BufferGeometry {
  const g = new SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  g.translate(cx, y0, cz);
  return flat(g);
}

function sawtooth(x0: number, z0: number, x1: number, z1: number, y0: number, rise: number): BufferGeometry[] {
  const out: BufferGeometry[] = [];
  const n = 3;
  const w = (x1 - x0) / n;
  for (let i = 0; i < n; i++) out.push(gable(x0 + i * w, z0, x0 + (i + 1) * w, z1, y0, rise));
  return out;
}

function parapet(x0: number, z0: number, x1: number, z1: number, y: number): BufferGeometry[] {
  const t = 0.04;
  return [
    box(x0, z0, x1, z0 + t, y, y + 0.06),
    box(x0, z1 - t, x1, z1, y, y + 0.06),
    box(x0, z0, x0 + t, z1, y, y + 0.06),
    box(x1 - t, z0, x1, z1, y, y + 0.06),
  ];
}

function addon(a: Addon, top: Vol): BufferGeometry[] {
  const [x0, , x1, z1, hf] = top;
  const y = hf;
  switch (a) {
    case 'none':
      return [];
    case 'canopy':
      return [box(-0.2, z1 + 0.06, 0.2, z1 + 0.22, 0.32, 0.36)];
    case 'bays':
      return [box(-0.3, z1, 0.3, z1 + 0.05, 0, 0.26), box(x1, -0.3, x1 + 0.05, 0.3, 0, 0.26)];
    case 'balconies':
      return [0.42, 0.62, 0.82].map((yy) => box(x0 + 0.02, z1, x1 - 0.02, z1 + 0.06, yy * y, yy * y + 0.025));
    case 'minaret': {
      const r = 0.07;
      const cyl = flat(new CylinderGeometry(r, r * 1.2, 1.5, 10, 1).translate(x1 - 0.1, 1.45, z1 - 0.1));
      const cap = flat(new CylinderGeometry(0, r * 1.5, 0.18, 10, 1).translate(x1 - 0.1, 2.3, z1 - 0.1));
      return [cyl, cap];
    }
    case 'fins':
      return [-0.3, -0.1, 0.1, 0.3].map((xx) => box(xx - 0.01, z1, xx + 0.01, z1 + 0.05, 0, y));
  }
}

/** Unit geometry for one variant. */
export function variantGeometry(spec: VariantSpec): BufferGeometry {
  const vols = plan(spec.arch);
  const parts: BufferGeometry[] = [];
  for (const v of vols) parts.push(box(v[0], v[1], v[2], v[3], 0, v[4]));

  const top = vols[vols.length - 1];
  const [tx0, tz0, tx1, tz1, th] = top;
  const roofY = th;
  switch (spec.roof) {
    case 'flat':
      break;
    case 'parapet':
      parts.push(...parapet(tx0, tz0, tx1, tz1, roofY));
      break;
    case 'gable':
      parts.push(gable(tx0, tz0, tx1, tz1, roofY, 0.3));
      break;
    case 'hip':
      parts.push(hip(tx0, tz0, tx1, tz1, roofY, 0.26));
      break;
    case 'sawtooth':
      parts.push(...sawtooth(tx0, tz0, tx1, tz1, roofY, 0.3));
      break;
    case 'dome':
      parts.push(dome((tx0 + tx1) / 2, (tz0 + tz1) / 2, roofY, 0.3));
      break;
  }
  for (const part of addon(spec.addon, top)) parts.push(part);

  // every part needs the same attribute set for mergeGeometries
  const clean = parts.map((g) => {
    const ng = g.index ? g.toNonIndexed() : g;
    if (!ng.getAttribute('uv')) ng.setAttribute('uv', ng.getAttribute('position').clone());
    return ng;
  });
  const merged = mergeGeometries(clean, false);
  if (!merged) throw new Error(`building variant ${spec.id} failed to merge`);
  merged.computeBoundingBox();
  return merged;
}

/* ---------- which variants suit which building ---------- */

const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Candidate variants per land use. Villas and houses use plans and roofs that read as homes. */
function candidates(b: AdBuilding): VariantSpec[] {
  const pick = (f: (v: VariantSpec) => boolean) => VARIANTS.filter(f);
  switch (b.k) {
    case 'house':
    case 'residential':
      return pick((v) => v.arch === 'villa' || v.arch === 'block' || v.arch === 'L' || v.arch === 'courtyard');
    case 'mosque':
      return pick((v) => v.roof === 'dome' || v.addon === 'minaret');
    case 'school':
    case 'hospital':
      return pick((v) => v.arch === 'block' || v.arch === 'courtyard' || v.arch === 'L');
    case 'office':
      return pick((v) => v.arch === 'tower' || v.arch === 'stepped' || v.arch === 'block');
    case 'mall':
      return pick((v) => v.arch === 'hall' || v.arch === 'block' || v.arch === 'L');
    case 'utility':
      return pick((v) => v.arch === 'block' || v.arch === 'cross');
    default: // building: warehouses, workshops, factories, depots
      return pick((v) => v.arch === 'hall' || v.arch === 'block' || v.arch === 'L' || v.arch === 'cross');
  }
}

/** Deterministic: the same building id always gets the same variant. */
export function variantFor(b: AdBuilding): VariantSpec {
  const list = candidates(b);
  const r = hash(b.id * 0.618 + 3.7);
  return list[Math.floor(r * list.length) % list.length];
}
