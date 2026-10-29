import { BoxGeometry, BufferGeometry, CylinderGeometry, ExtrudeGeometry, Float32BufferAttribute, Shape } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Procedural low-poly vehicles. Each model is one merged geometry whose vertices
 * carry an `aPart` id (paint, glass, tyres, head/tail lights, beacons…) so a single
 * instanced draw call renders a whole fleet with per-part materials.
 *
 * Modelled in metres (forward = +z, up = +y, left = +x), then scaled to world units.
 * Vehicles are drawn at 2.1× real size so they read against the wide avenues from the city camera.
 */
export const VEHICLE_SCALE = 0.21;

export const PART = {
  paint: 0,
  glass: 1,
  trim: 2,
  head: 3,
  tail: 4,
  chrome: 5,
  sign: 6,
  red: 7,
  blue: 8,
  white: 9,
  accent: 10,
  amber: 11,
  indL: 12,
  indR: 13,
} as const;

export type VehicleKind = 'sedan' | 'hatch' | 'suv' | 'van' | 'taxi' | 'bus' | 'truck' | 'police' | 'crew'
  | 'pickup' | 'minibus' | 'coach' | 'boxTruck' | 'flatbed' | 'tanker' | 'waterTanker' | 'reefer' | 'tractor'
  | 'semi' | 'container20' | 'carTransporter' | 'towTruck' | 'fireEngine' | 'ambulance' | 'garbage' | 'serviceVan'
  | 'forklift' | 'yardTractor' | 'reachStacker' | 'excavator' | 'wheelLoader' | 'bulldozer'
  | 'luxurySedan' | 'coupe' | 'crossover' | 'largeSuv' | 'boxSuv';

export function tag(g: BufferGeometry, part: number): BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g;
  if (ng.getAttribute('uv')) ng.deleteAttribute('uv');
  const n = ng.getAttribute('position').count;
  ng.setAttribute('aPart', new Float32BufferAttribute(new Float32Array(n).fill(part), 1));
  return ng;
}

/** Axis-aligned box: w = width (x), h = height (y), l = length (z). */
export function box(w: number, h: number, l: number, x: number, y: number, z: number, part: number) {
  return tag(new BoxGeometry(w, h, l).translate(x, y, z), part);
}

/** Side profile [along, up] extruded across the vehicle width, with rounded (bevelled) edges. */
export function profile(points: [number, number][], width: number, part: number, bevel = 0.05) {
  const shape = new Shape();
  points.forEach(([a, u], i) => (i ? shape.lineTo(a, u) : shape.moveTo(a, u)));
  shape.closePath();
  const depth = Math.max(0.01, width - bevel * 2);
  const g = new ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 1,
  });
  g.translate(0, 0, -depth / 2);
  g.rotateY(-Math.PI / 2);
  return tag(g, part);
}

export function wheels(axles: number[], track: number, r: number, w: number) {
  const out: BufferGeometry[] = [];
  for (const z of axles)
    for (const side of [-1, 1]) {
      const x = side * track;
      out.push(tag(new CylinderGeometry(r, r, w, 12, 1).rotateZ(Math.PI / 2).translate(x, r, z), PART.trim));
      out.push(tag(new CylinderGeometry(r * 0.6, r * 0.6, w + 0.02, 10, 1).rotateZ(Math.PI / 2).translate(x, r, z), PART.chrome));
    }
  return out;
}

/** Head/tail lights, indicators, grille, bumpers and mirrors for a car-like body. */
export function carDetails(o: { W: number; front: number; rear: number; headY: number; tailY: number; bumperY: number; mirrorZ: number; mirrorY: number }) {
  const { W, front, rear, headY, tailY, bumperY, mirrorZ, mirrorY } = o;
  const hx = W / 2 - 0.3;
  return [
    box(0.42, 0.13, 0.08, hx, headY, front - 0.02, PART.head),
    box(0.42, 0.13, 0.08, -hx, headY, front - 0.02, PART.head),
    box(0.11, 0.09, 0.07, W / 2 - 0.06, headY, front - 0.06, PART.indL),
    box(0.11, 0.09, 0.07, -(W / 2 - 0.06), headY, front - 0.06, PART.indR),
    box(0.44, 0.13, 0.07, hx, tailY, rear + 0.02, PART.tail),
    box(0.44, 0.13, 0.07, -hx, tailY, rear + 0.02, PART.tail),
    box(0.12, 0.08, 0.06, W / 2 - 0.08, tailY - 0.12, rear + 0.03, PART.indL),
    box(0.12, 0.08, 0.06, -(W / 2 - 0.08), tailY - 0.12, rear + 0.03, PART.indR),
    box(0.72, 0.13, 0.06, 0, headY - 0.13, front + 0.01, PART.trim),
    box(W - 0.02, 0.13, 0.14, 0, bumperY, front - 0.05, PART.trim),
    box(W - 0.02, 0.13, 0.14, 0, bumperY, rear + 0.05, PART.trim),
    box(W + 0.01, 0.07, (front - rear) * 0.62, 0, bumperY - 0.01, (front + rear) / 2, PART.trim),
    box(0.16, 0.1, 0.08, W / 2 + 0.06, mirrorY, mirrorZ, PART.paint),
    box(0.16, 0.1, 0.08, -(W / 2 + 0.06), mirrorY, mirrorZ, PART.paint),
  ];
}

function sedan(): BufferGeometry[] {
  const W = 1.82;
  return [
    profile([[-2.34, 0.3], [2.3, 0.3], [2.38, 0.5], [2.33, 0.68], [1.3, 0.84], [-1.8, 0.9], [-2.28, 0.86], [-2.37, 0.62]], W, PART.paint),
    profile([[1.3, 0.82], [0.28, 1.38], [-0.82, 1.4], [-1.72, 0.9]], W - 0.3, PART.glass, 0.04),
    box(W - 0.26, 0.05, 1.12, 0, 1.425, -0.27, PART.paint),
    box(W - 0.26, 0.5, 0.1, 0, 1.13, -0.28, PART.trim),
    ...carDetails({ W, front: 2.34, rear: -2.35, headY: 0.62, tailY: 0.74, bumperY: 0.36, mirrorZ: 1.05, mirrorY: 0.98 }),
    ...wheels([1.42, -1.42], W / 2 - 0.12, 0.33, 0.22),
  ];
}

function hatch(): BufferGeometry[] {
  const W = 1.78;
  return [
    profile([[-2.0, 0.3], [1.98, 0.3], [2.06, 0.5], [2.01, 0.68], [1.12, 0.86], [-1.92, 0.94], [-2.06, 0.86], [-2.07, 0.6]], W, PART.paint),
    profile([[1.12, 0.84], [0.18, 1.42], [-1.6, 1.4], [-1.96, 0.92]], W - 0.3, PART.glass, 0.04),
    box(W - 0.26, 0.05, 1.72, 0, 1.44, -0.7, PART.paint),
    box(W - 0.26, 0.52, 0.12, 0, 1.15, -0.42, PART.trim),
    ...carDetails({ W, front: 2.03, rear: -2.04, headY: 0.64, tailY: 0.8, bumperY: 0.36, mirrorZ: 0.9, mirrorY: 1.0 }),
    ...wheels([1.28, -1.3], W / 2 - 0.12, 0.31, 0.21),
  ];
}

function suv(): BufferGeometry[] {
  const W = 1.94;
  return [
    profile([[-2.4, 0.42], [2.36, 0.42], [2.44, 0.62], [2.4, 0.92], [1.35, 1.05], [-2.32, 1.08], [-2.44, 0.98], [-2.45, 0.7]], W, PART.paint),
    profile([[1.35, 1.03], [0.52, 1.7], [-2.02, 1.72], [-2.3, 1.06]], W - 0.24, PART.glass, 0.04),
    box(W - 0.2, 0.05, 2.56, 0, 1.745, -0.74, PART.paint),
    box(0.06, 0.05, 2.3, W / 2 - 0.22, 1.8, -0.74, PART.trim),
    box(0.06, 0.05, 2.3, -(W / 2 - 0.22), 1.8, -0.74, PART.trim),
    box(W - 0.2, 0.66, 0.12, 0, 1.38, -0.22, PART.trim),
    box(W - 0.2, 0.66, 0.14, 0, 1.38, -1.36, PART.paint),
    ...carDetails({ W, front: 2.42, rear: -2.44, headY: 0.82, tailY: 0.98, bumperY: 0.48, mirrorZ: 1.1, mirrorY: 1.2 }),
    ...wheels([1.5, -1.5], W / 2 - 0.13, 0.38, 0.25),
  ];
}

/** Long, low executive saloon (5.1 m): a longer bonnet and a fast rear screen. */
function luxurySedan(): BufferGeometry[] {
  const W = 1.9;
  return [
    profile([[-2.55, 0.3], [2.5, 0.3], [2.58, 0.48], [2.53, 0.66], [1.55, 0.82], [-1.95, 0.88], [-2.48, 0.84], [-2.58, 0.6]], W, PART.paint),
    profile([[1.55, 0.8], [0.45, 1.36], [-0.9, 1.38], [-1.9, 0.88]], W - 0.3, PART.glass, 0.04),
    box(W - 0.26, 0.05, 1.2, 0, 1.405, -0.24, PART.paint),
    box(W - 0.26, 0.48, 0.1, 0, 1.12, -0.3, PART.trim),
    box(0.9, 0.16, 0.05, 0, 0.5, 2.56, PART.chrome), // wide chrome grille
    ...carDetails({ W, front: 2.55, rear: -2.56, headY: 0.6, tailY: 0.72, bumperY: 0.36, mirrorZ: 1.2, mirrorY: 0.96 }),
    ...wheels([1.58, -1.55], W / 2 - 0.12, 0.34, 0.24),
  ];
}

/** Two-door sports coupé (4.6 m): low roof set well back. */
function coupe(): BufferGeometry[] {
  const W = 1.88;
  return [
    profile([[-2.28, 0.28], [2.26, 0.28], [2.34, 0.44], [2.28, 0.6], [1.0, 0.76], [-1.7, 0.84], [-2.22, 0.8], [-2.32, 0.56]], W, PART.paint),
    profile([[1.0, 0.74], [0.0, 1.2], [-0.9, 1.22], [-1.75, 0.84]], W - 0.36, PART.glass, 0.04),
    box(W - 0.34, 0.05, 0.9, 0, 1.235, -0.45, PART.paint),
    box(1.2, 0.05, 0.22, 0, 0.88, -2.14, PART.trim), // rear spoiler
    ...carDetails({ W, front: 2.28, rear: -2.3, headY: 0.54, tailY: 0.66, bumperY: 0.32, mirrorZ: 0.85, mirrorY: 0.9 }),
    ...wheels([1.4, -1.36], W / 2 - 0.13, 0.33, 0.26),
  ];
}

/** Compact crossover SUV (4.5 m): raised, rounded, roof rails. */
function crossover(): BufferGeometry[] {
  const W = 1.86;
  return [
    profile([[-2.22, 0.4], [2.2, 0.4], [2.28, 0.6], [2.22, 0.86], [1.2, 1.0], [-2.05, 1.04], [-2.24, 0.94], [-2.28, 0.68]], W, PART.paint),
    profile([[1.2, 0.98], [0.35, 1.58], [-1.6, 1.6], [-2.08, 1.02]], W - 0.26, PART.glass, 0.04),
    box(W - 0.22, 0.05, 2.0, 0, 1.625, -0.62, PART.paint),
    box(0.05, 0.05, 1.8, W / 2 - 0.24, 1.67, -0.62, PART.trim),
    box(0.05, 0.05, 1.8, -(W / 2 - 0.24), 1.67, -0.62, PART.trim),
    box(W - 0.22, 0.6, 0.12, 0, 1.3, -0.3, PART.trim),
    ...carDetails({ W, front: 2.24, rear: -2.26, headY: 0.78, tailY: 0.94, bumperY: 0.46, mirrorZ: 1.0, mirrorY: 1.14 }),
    ...wheels([1.36, -1.36], W / 2 - 0.13, 0.36, 0.24),
  ];
}

/** Full-size body-on-frame SUV (4.95 m), the Land Cruiser shape: tall, square shoulders, roof rack. */
function largeSuv(): BufferGeometry[] {
  const W = 1.98;
  return [
    profile([[-2.42, 0.46], [2.4, 0.46], [2.48, 0.7], [2.44, 1.02], [1.45, 1.12], [-2.4, 1.14], [-2.48, 1.04], [-2.48, 0.72]], W, PART.paint),
    profile([[1.45, 1.1], [0.8, 1.86], [-2.22, 1.88], [-2.38, 1.12]], W - 0.2, PART.glass, 0.03),
    box(W - 0.16, 0.06, 3.1, 0, 1.91, -0.72, PART.paint),
    box(W - 0.4, 0.05, 2.4, 0, 1.99, -0.72, PART.trim), // roof rack
    box(W - 0.16, 0.74, 0.12, 0, 1.5, -0.4, PART.trim),
    box(W - 0.16, 0.74, 0.12, 0, 1.5, -1.5, PART.paint),
    box(1.0, 0.22, 0.05, 0, 0.82, 2.49, PART.chrome),
    box(W + 0.08, 0.06, 2.6, 0, 0.42, 0, PART.trim), // side steps
    ...carDetails({ W, front: 2.44, rear: -2.46, headY: 0.92, tailY: 1.04, bumperY: 0.52, mirrorZ: 1.2, mirrorY: 1.3 }),
    ...wheels([1.45, -1.45], W / 2 - 0.12, 0.4, 0.27),
  ];
}

/** Boxy upright off-roader (4.8 m), the G-Class shape: flat panels, upright screen, spare wheel on the tailgate. */
function boxSuv(): BufferGeometry[] {
  const W = 1.94;
  return [
    box(W, 0.74, 4.5, 0, 0.82, 0, PART.paint),
    box(W - 0.06, 0.62, 2.9, 0, 1.5, -0.55, PART.glass),
    box(W - 0.02, 0.06, 3.0, 0, 1.84, -0.55, PART.paint),
    box(W - 0.02, 0.62, 0.1, 0, 1.5, 0.92, PART.paint),
    box(0.1, 0.62, 0.1, W / 2 - 0.05, 1.5, -1.95, PART.paint),
    box(0.1, 0.62, 0.1, -(W / 2 - 0.05), 1.5, -1.95, PART.paint),
    tag(new CylinderGeometry(0.36, 0.36, 0.22, 12).rotateX(Math.PI / 2).translate(0, 1.0, -2.38), PART.trim),
    ...carDetails({ W, front: 2.25, rear: -2.27, headY: 0.94, tailY: 1.0, bumperY: 0.5, mirrorZ: 0.95, mirrorY: 1.3 }),
    ...wheels([1.42, -1.42], W / 2 - 0.1, 0.4, 0.27),
  ];
}

function van(): BufferGeometry[] {
  const W = 2.0;
  return [
    profile([[-2.6, 0.38], [2.5, 0.38], [2.62, 0.6], [2.58, 0.95], [2.0, 1.12], [0.55, 1.12], [0.55, 2.08], [-2.6, 2.08]], W, PART.paint),
    profile([[2.0, 1.1], [1.42, 1.98], [0.5, 2.0], [0.5, 1.1]], W - 0.16, PART.glass, 0.04),
    box(W - 0.14, 0.05, 1.0, 0, 2.03, 1.0, PART.paint),
    box(W + 0.02, 0.06, 4.6, 0, 1.0, -0.05, PART.trim),
    box(0.06, 1.5, 0.02, 0.35, 1.25, -2.62, PART.trim),
    ...carDetails({ W, front: 2.56, rear: -2.61, headY: 0.8, tailY: 1.0, bumperY: 0.44, mirrorZ: 1.75, mirrorY: 1.3 }),
    ...wheels([1.75, -1.65], W / 2 - 0.13, 0.36, 0.24),
  ];
}

function taxi(): BufferGeometry[] {
  return [...sedan(), box(0.62, 0.16, 0.24, 0, 1.53, -0.25, PART.sign)];
}

function police(): BufferGeometry[] {
  return [
    ...sedan(),
    box(1.3, 0.05, 0.3, 0, 1.47, -0.25, PART.trim),
    box(0.58, 0.11, 0.26, 0.32, 1.54, -0.25, PART.red),
    box(0.58, 0.11, 0.26, -0.32, 1.54, -0.25, PART.blue),
    box(1.84, 0.18, 1.6, 0, 0.62, 0.15, PART.white),
  ];
}

function bus(): BufferGeometry[] {
  const W = 2.55;
  const out: BufferGeometry[] = [
    profile([[-6.0, 0.35], [5.92, 0.35], [6.02, 0.6], [6.02, 2.92], [5.78, 3.16], [-5.92, 3.16], [-6.02, 2.95]], W, PART.paint, 0.06),
    box(W + 0.03, 1.1, 10.1, 0, 2.02, -0.45, PART.glass),
    box(W - 0.24, 1.75, 0.05, 0, 2.0, 6.06, PART.glass),
    box(1.5, 0.24, 0.05, 0, 2.98, 6.07, PART.sign),
    box(1.8, 0.32, 3.0, 0, 3.32, -1.2, PART.white),
    box(W + 0.04, 0.12, 11.6, 0, 0.42, 0, PART.trim),
    box(0.04, 2.15, 1.15, -(W / 2 + 0.01), 1.45, 4.7, PART.glass),
    box(0.04, 2.15, 1.15, -(W / 2 + 0.01), 1.45, -0.7, PART.glass),
    box(0.4, 0.18, 0.06, 0.9, 0.72, 6.04, PART.head),
    box(0.4, 0.18, 0.06, -0.9, 0.72, 6.04, PART.head),
    box(0.3, 0.42, 0.06, 1.0, 1.1, -6.04, PART.tail),
    box(0.3, 0.42, 0.06, -1.0, 1.1, -6.04, PART.tail),
    box(0.14, 0.12, 0.06, W / 2 - 0.1, 0.92, 6.04, PART.indL),
    box(0.14, 0.12, 0.06, -(W / 2 - 0.1), 0.92, 6.04, PART.indR),
    box(0.14, 0.14, 0.06, W / 2 - 0.1, 0.72, -6.05, PART.indL),
    box(0.14, 0.14, 0.06, -(W / 2 - 0.1), 0.72, -6.05, PART.indR),
    ...wheels([3.9, -3.2], W / 2 - 0.17, 0.5, 0.32),
  ];
  for (let z = -5.2; z <= 4.4; z += 1.6) out.push(box(W + 0.05, 1.12, 0.1, 0, 2.02, z, PART.trim));
  return out;
}

function truck(): BufferGeometry[] {
  const W = 2.3;
  return [
    profile([[1.75, 0.45], [3.42, 0.45], [3.48, 0.72], [3.45, 1.32], [1.75, 1.32]], W, PART.paint, 0.05),
    profile([[3.45, 1.3], [3.12, 2.42], [2.25, 2.46], [2.25, 1.3]], W - 0.12, PART.glass, 0.04),
    profile([[2.27, 1.3], [2.27, 2.46], [1.75, 2.46], [1.75, 1.3]], W, PART.paint, 0.04),
    box(W - 0.1, 0.06, 1.25, 0, 2.47, 2.75, PART.paint),
    box(2.5, 2.95, 5.7, 0, 2.0, -1.28, PART.white),
    box(1.1, 0.32, 7.6, 0, 0.62, -0.4, PART.trim),
    box(0.4, 0.16, 0.06, 0.82, 0.86, 3.47, PART.head),
    box(0.4, 0.16, 0.06, -0.82, 0.86, 3.47, PART.head),
    box(0.14, 0.12, 0.06, W / 2 - 0.08, 0.86, 3.44, PART.indL),
    box(0.14, 0.12, 0.06, -(W / 2 - 0.08), 0.86, 3.44, PART.indR),
    box(0.3, 0.2, 0.05, 1.0, 0.75, -4.15, PART.tail),
    box(0.3, 0.2, 0.05, -1.0, 0.75, -4.15, PART.tail),
    box(0.14, 0.14, 0.05, 1.14, 0.55, -4.15, PART.indL),
    box(0.14, 0.14, 0.05, -1.14, 0.55, -4.15, PART.indR),
    box(W + 0.02, 0.14, 0.2, 0, 0.5, 3.42, PART.trim),
    ...wheels([2.65], W / 2 - 0.15, 0.48, 0.3),
    ...wheels([-2.1, -3.15], W / 2 - 0.2, 0.48, 0.4),
  ];
}

/** Utility crew truck: white cab, service body with hi-vis chevrons, amber light bar, pipe rack. */
function crew(): BufferGeometry[] {
  const W = 2.2;
  return [
    profile([[1.6, 0.45], [3.3, 0.45], [3.36, 0.72], [3.33, 1.28], [1.6, 1.28]], W, PART.white, 0.05),
    profile([[3.33, 1.26], [3.0, 2.3], [2.1, 2.34], [2.1, 1.26]], W - 0.12, PART.glass, 0.04),
    profile([[2.12, 1.26], [2.12, 2.34], [1.6, 2.34], [1.6, 1.26]], W, PART.white, 0.04),
    box(W - 0.1, 0.06, 1.25, 0, 2.35, 2.6, PART.white),
    box(1.4, 0.12, 0.3, 0, 2.44, 2.55, PART.trim),
    box(0.6, 0.13, 0.28, 0.36, 2.55, 2.55, PART.amber),
    box(0.6, 0.13, 0.28, -0.36, 2.55, 2.55, PART.amber),
    box(2.36, 1.55, 4.3, 0, 1.25, -0.75, PART.white),
    box(2.38, 0.22, 4.32, 0, 0.72, -0.75, PART.accent),
    box(2.38, 0.08, 4.32, 0, 1.95, -0.75, PART.accent),
    box(2.0, 0.08, 4.0, 0, 2.06, -0.8, PART.trim),
    box(0.08, 0.6, 0.08, 0.95, 2.35, 0.9, PART.trim),
    box(0.08, 0.6, 0.08, -0.95, 2.35, 0.9, PART.trim),
    box(0.08, 0.6, 0.08, 0.95, 2.35, -2.6, PART.trim),
    box(0.08, 0.6, 0.08, -0.95, 2.35, -2.6, PART.trim),
    box(0.36, 0.36, 3.9, 0.45, 2.3, -0.85, PART.chrome),
    box(0.36, 0.36, 3.9, -0.4, 2.3, -0.85, PART.accent),
    box(0.5, 0.18, 0.12, 0.6, 2.2, -2.95, PART.amber),
    box(0.5, 0.18, 0.12, -0.6, 2.2, -2.95, PART.amber),
    box(0.4, 0.16, 0.06, 0.8, 0.86, 3.35, PART.head),
    box(0.4, 0.16, 0.06, -0.8, 0.86, 3.35, PART.head),
    box(0.3, 0.2, 0.05, 1.0, 0.75, -2.92, PART.tail),
    box(0.3, 0.2, 0.05, -1.0, 0.75, -2.92, PART.tail),
    box(W + 0.02, 0.14, 0.2, 0, 0.5, 3.3, PART.trim),
    box(1.0, 0.3, 6.0, 0, 0.58, 0.1, PART.trim),
    ...wheels([2.5], W / 2 - 0.15, 0.45, 0.3),
    ...wheels([-1.6], W / 2 - 0.18, 0.45, 0.38),
  ];
}


/** Cylinder along the vehicle's length (z), centred at (x, y, z). */
function cyl(r: number, len: number, x: number, y: number, z: number, part: number) {
  return tag(new CylinderGeometry(r, r, len, 14, 1).rotateX(Math.PI / 2).translate(x, y, z), part);
}

/** Cab shared by the heavy rigid and articulated models: sloped bonnet, raked windscreen, mirrors. */
function heavyCab(W: number, part: number = PART.paint): BufferGeometry[] {
  return [
    profile([[2.4, 0.7], [2.5, 2.2], [1.6, 2.5], [0.2, 2.5], [-0.6, 1.1], [-0.6, 0.7]], W, part),
    profile([[2.42, 1.6], [2.46, 2.1], [1.7, 2.32], [1.36, 1.6]], W - 0.24, PART.glass, 0.03),
    box(0.42, 0.14, 0.08, W / 2 - 0.3, 1.1, 2.5, PART.head),
    box(0.42, 0.14, 0.08, -(W / 2 - 0.3), 1.1, 2.5, PART.head),
    box(0.12, 0.1, 0.06, W / 2 + 0.08, 1.9, 1.7, PART.paint),
    box(0.12, 0.1, 0.06, -(W / 2 + 0.08), 1.9, 1.7, PART.paint),
    box(W - 0.1, 0.13, 0.14, 0, 0.5, 2.5, PART.trim),
  ];
}

function pickup(): BufferGeometry[] {
  const W = 1.96;
  return [
    profile([[-2.5, 0.42], [2.3, 0.42], [2.42, 0.66], [2.38, 0.98], [1.2, 1.05], [-0.2, 1.05], [-0.2, 1.1], [-2.5, 1.1]], W, PART.paint),
    profile([[1.2, 1.03], [0.3, 1.62], [-0.2, 1.62], [-0.2, 1.05]], W - 0.24, PART.glass, 0.04),
    box(W - 0.14, 0.12, 2.3, 0, 0.9, -1.6, PART.trim),
    box(0.08, 0.5, 2.3, W / 2 - 0.06, 1.2, -1.6, PART.paint),
    box(0.08, 0.5, 2.3, -(W / 2 - 0.06), 1.2, -1.6, PART.paint),
    box(W - 0.14, 0.5, 0.08, 0, 1.2, -2.7, PART.paint),
    ...carDetails({ W, front: 2.4, rear: -2.5, headY: 0.9, tailY: 1.0, bumperY: 0.46, mirrorZ: 0.9, mirrorY: 1.35 }),
    ...wheels([1.5, -1.6], W / 2 - 0.14, 0.4, 0.28),
  ];
}

function minibus(): BufferGeometry[] {
  const W = 2.0;
  return [
    profile([[-2.6, 0.4], [2.5, 0.4], [2.6, 0.7], [2.58, 2.2], [2.2, 2.36], [-2.3, 2.36], [-2.6, 2.1], [-2.62, 0.8]], W, PART.paint),
    box(W + 0.02, 0.6, 3.6, 0, 1.6, -0.2, PART.glass),
    box(W - 0.2, 0.06, 4.4, 0, 2.4, -0.2, PART.trim),
    box(W + 0.02, 0.1, 0.9, 0, 0.9, 2.5, PART.trim),
    ...carDetails({ W, front: 2.6, rear: -2.62, headY: 0.9, tailY: 1.0, bumperY: 0.42, mirrorZ: 1.6, mirrorY: 1.5 }),
    ...wheels([1.8, -1.8], W / 2 - 0.14, 0.36, 0.26),
  ];
}

function coach(): BufferGeometry[] {
  const W = 2.5;
  return [
    profile([[-6.0, 0.8], [5.9, 0.8], [6.05, 1.1], [6.0, 3.1], [5.5, 3.25], [-5.8, 3.25], [-6.1, 2.8], [-6.15, 1.2]], W, PART.paint),
    box(W + 0.02, 0.9, 10.6, 0, 2.2, 0.1, PART.glass),
    box(W - 0.2, 0.08, 11.4, 0, 3.28, 0, PART.trim),
    box(W - 0.2, 0.22, 0.1, 0, 2.95, 6.0, PART.glass),
    ...carDetails({ W, front: 6.05, rear: -6.1, headY: 1.3, tailY: 1.5, bumperY: 0.8, mirrorZ: 4.6, mirrorY: 2.6 }),
    ...wheels([4.9, -4.6, -5.5], W / 2 - 0.2, 0.5, 0.35),
  ];
}

function boxTruck(): BufferGeometry[] {
  const W = 2.3;
  return [
    ...heavyCab(W),
    box(W, 2.6, 5.2, 0, 2.0, -0.3, PART.paint),
    box(W - 0.6, 0.35, 7.0, 0, 0.6, -0.4, PART.trim),
    box(W - 0.02, 0.2, 5.2, 0, 3.35, -0.3, PART.trim),
    ...wheels([2.0, -2.0, -3.0], W / 2 - 0.12, 0.45, 0.35),
  ];
}

function flatbed(): BufferGeometry[] {
  const W = 2.4;
  return [
    ...heavyCab(W),
    box(W - 0.2, 0.2, 6.6, 0, 1.1, -1.0, PART.trim),
    box(1.4, 1.0, 2.2, 0.3, 1.7, -1.6, PART.accent),
    box(1.6, 0.6, 1.8, -0.4, 1.5, 0.6, PART.white),
    box(W - 0.2, 0.1, 6.4, 0, 1.25, -1.0, PART.trim),
    ...wheels([2.0, -2.0, -3.6], W / 2 - 0.12, 0.45, 0.35),
  ];
}

function tanker(): BufferGeometry[] {
  return [
    ...heavyCab(2.4),
    cyl(1.05, 6.8, 0, 1.8, -1.2, PART.white),
    cyl(1.07, 0.8, 0, 1.8, -3.6, PART.red),
    box(1.6, 0.3, 0.9, 0, 1.0, -1.6, PART.trim),
    box(2.3, 0.2, 7.2, 0, 0.6, -1.2, PART.trim),
    ...wheels([2.0, -2.0, -3.6], 1.1, 0.45, 0.35),
  ];
}

function waterTanker(): BufferGeometry[] {
  return [
    ...heavyCab(2.4),
    cyl(1.0, 6.0, 0, 1.7, -1.0, PART.blue),
    box(1.5, 0.3, 0.9, 0, 0.95, -1.6, PART.trim),
    box(2.3, 0.2, 6.6, 0, 0.6, -1.0, PART.trim),
    ...wheels([2.0, -2.0, -3.4], 1.1, 0.45, 0.35),
  ];
}

function reefer(): BufferGeometry[] {
  const W = 2.5;
  return [
    ...heavyCab(W),
    box(W, 2.7, 5.5, 0, 2.1, -1.6, PART.white),
    box(1.5, 0.5, 0.6, 0, 3.55, 0.2, PART.trim),
    box(W - 0.2, 0.2, 5.4, 0, 0.7, -1.4, PART.trim),
    ...wheels([2.0, -2.0, -3.4], W / 2 - 0.12, 0.45, 0.35),
  ];
}

function tractor(): BufferGeometry[] {
  const W = 2.5;
  return [
    profile([[-1.4, 0.7], [1.4, 0.7], [1.7, 1.0], [1.6, 2.7], [0.6, 3.0], [-0.7, 3.0], [-1.4, 2.2]], W, PART.paint),
    box(2.2, 0.9, 0.05, 0, 2.25, 1.66, PART.glass),
    box(2.0, 0.2, 1.4, 0, 1.2, -1.2, PART.trim),
    box(W - 0.4, 0.3, 0.3, 0, 0.9, 1.7, PART.trim),
    box(0.42, 0.14, 0.08, 0.9, 1.1, 1.7, PART.head),
    box(0.42, 0.14, 0.08, -0.9, 1.1, 1.7, PART.head),
    ...wheels([1.0, -1.0], 1.15, 0.52, 0.4),
  ];
}

function semi(): BufferGeometry[] {
  return [
    ...tractor(),
    box(2.5, 0.25, 12.0, 0, 1.25, -8.2, PART.trim),
    box(2.5, 2.7, 12.2, 0, 2.75, -8.2, PART.white),
    box(2.5, 0.12, 12.2, 0, 4.1, -8.2, PART.trim),
    ...wheels([-12.6, -13.8, -14.9], 1.2, 0.5, 0.4),
  ];
}

function container20(): BufferGeometry[] {
  const W = 2.5;
  return [
    ...heavyCab(W),
    box(W - 0.1, 0.25, 6.4, 0, 1.0, -1.4, PART.trim),
    box(2.44, 2.59, 6.06, 0, 2.5, -1.4, PART.blue),
    box(2.46, 0.12, 6.1, 0, 3.8, -1.4, PART.trim),
    ...wheels([2.0, -2.2, -3.4], W / 2 - 0.12, 0.45, 0.35),
  ];
}

function carTransporter(): BufferGeometry[] {
  return [
    ...tractor(),
    box(2.6, 0.12, 12.0, 0, 1.2, -8.0, PART.trim),
    box(2.5, 0.1, 11.0, 0, 2.6, -8.0, PART.trim),
    box(1.8, 0.9, 4.2, 0, 1.8, -9.0, PART.paint),
    box(1.8, 0.9, 4.2, 0, 1.8, -4.0, PART.red),
    box(1.8, 0.9, 3.6, 0, 3.7, -6.5, PART.white),
    ...wheels([-12.6, -13.8, -14.9], 1.2, 0.5, 0.4),
  ];
}

function towTruck(): BufferGeometry[] {
  const W = 2.4;
  return [
    ...heavyCab(W),
    box(W - 0.2, 0.2, 4.4, 0, 1.2, -1.2, PART.trim),
    box(0.18, 0.18, 4.0, 0, 2.6, -2.4, PART.amber),
    box(0.9, 0.2, 0.9, 0, 0.9, -1.2, PART.amber),
    box(0.8, 0.2, 0.2, 0, 3.9, 0.2, PART.amber),
    ...wheels([2.0, -2.0, -3.2], W / 2 - 0.12, 0.45, 0.35),
  ];
}

function fireEngine(): BufferGeometry[] {
  const W = 2.5;
  return [
    ...heavyCab(W, PART.red),
    box(W, 2.2, 5.6, 0, 2.1, -1.4, PART.red),
    box(0.4, 0.3, 7.5, 0, 3.5, -1.2, PART.chrome),
    box(W - 0.2, 0.3, 4.6, 0, 1.0, -1.4, PART.trim),
    box(0.9, 0.24, 0.3, 0, 3.4, -4.0, PART.amber),
    ...wheels([2.0, -2.0, -3.6], W / 2 - 0.12, 0.45, 0.35),
  ];
}

function ambulance(): BufferGeometry[] {
  return [
    ...van(),
    box(2.02, 0.22, 4.4, 0, 1.35, -0.2, PART.red),
    box(0.4, 0.14, 0.12, 0, 2.2, 0.0, PART.blue),
    box(0.3, 0.12, 0.12, 0.5, 2.2, 0.0, PART.red),
  ];
}

function garbage(): BufferGeometry[] {
  const W = 2.5;
  return [
    ...heavyCab(W),
    box(W, 2.4, 4.8, 0, 2.2, -2.2, PART.paint),
    box(W - 0.2, 0.3, 2.0, 0, 3.5, -1.0, PART.trim),
    box(W - 0.2, 0.2, 5.0, 0, 0.8, -2.2, PART.trim),
    ...wheels([2.0, -2.0, -3.6], W / 2 - 0.12, 0.45, 0.35),
  ];
}

function serviceVan(): BufferGeometry[] {
  return [
    ...van(),
    box(2.0, 0.08, 3.0, 0, 2.25, -0.6, PART.trim),
    box(0.6, 0.12, 0.2, 0.4, 2.05, -2.7, PART.amber),
    box(0.6, 0.12, 0.2, -0.4, 2.05, -2.7, PART.amber),
  ];
}

function forklift(): BufferGeometry[] {
  return [
    box(1.2, 0.5, 1.8, 0, 0.5, 0, PART.paint),
    box(1.2, 1.1, 0.1, 0, 1.6, -0.6, PART.trim),
    box(1.3, 0.1, 1.2, 0, 2.3, -0.2, PART.trim),
    box(0.12, 2.6, 0.12, 0.4, 1.7, 1.2, PART.trim),
    box(0.12, 2.6, 0.12, -0.4, 1.7, 1.2, PART.trim),
    box(0.12, 0.08, 1.2, 0.4, 0.15, 2.0, PART.trim),
    box(0.12, 0.08, 1.2, -0.4, 0.15, 2.0, PART.trim),
    ...wheels([-0.6, 0.6], 0.6, 0.22, 0.3),
  ];
}

function yardTractor(): BufferGeometry[] {
  return [
    box(1.8, 1.0, 2.2, 0, 1.0, -0.2, PART.paint),
    box(1.6, 0.5, 0.05, 0, 1.4, 0.94, PART.glass),
    box(1.2, 0.2, 1.2, 0, 0.7, -2.0, PART.trim),
    box(1.9, 0.12, 0.2, 0, 0.5, 1.0, PART.trim),
    ...wheels([0.8, -1.0], 0.85, 0.4, 0.4),
  ];
}

function reachStacker(): BufferGeometry[] {
  return [
    box(2.8, 2.0, 6.5, 0, 1.8, -2.0, PART.paint),
    box(2.6, 1.5, 2.0, 0, 3.6, -5.5, PART.glass),
    box(0.5, 4.8, 0.5, 0, 3.5, 4.0, PART.trim),
    box(2.0, 0.2, 2.6, 0, 6.0, 4.0, PART.accent),
    box(0.4, 0.4, 3.0, 0, 5.0, 2.2, PART.accent),
    ...wheels([2.0, -2.0], 1.4, 0.6, 0.5),
  ];
}

function excavator(): BufferGeometry[] {
  return [
    box(0.8, 0.8, 4.2, 1.2, 0.4, 0, PART.trim),
    box(0.8, 0.8, 4.2, -1.2, 0.4, 0, PART.trim),
    box(2.0, 1.4, 2.4, 0, 1.6, -0.5, PART.accent),
    box(1.6, 0.8, 0.8, 0, 2.5, 0.5, PART.glass),
    box(0.45, 0.45, 4.6, 0, 2.4, 3.0, PART.accent),
    box(0.35, 0.35, 3.6, 0, 1.0, 6.0, PART.accent),
    box(0.9, 0.6, 0.7, 0, 0.4, 7.8, PART.trim),
  ];
}

function wheelLoader(): BufferGeometry[] {
  return [
    box(2.4, 1.8, 3.0, 0, 1.5, -1.4, PART.accent),
    box(2.0, 1.4, 1.8, 0, 2.8, -1.6, PART.glass),
    box(0.4, 0.4, 2.0, 0, 1.8, 1.2, PART.trim),
    box(2.6, 0.9, 0.9, 0, 1.0, 3.0, PART.trim),
    ...wheels([1.8, -1.8], 1.3, 0.7, 0.6),
  ];
}

function bulldozer(): BufferGeometry[] {
  return [
    box(2.4, 1.4, 3.6, 0, 1.4, 0, PART.accent),
    box(2.0, 1.2, 1.6, 0, 2.6, -0.8, PART.glass),
    box(3.2, 1.2, 0.3, 0, 0.9, 3.8, PART.trim),
    box(0.6, 0.9, 5.2, 1.5, 0.45, 0, PART.trim),
    box(0.6, 0.9, 5.2, -1.5, 0.45, 0, PART.trim),
  ];
}

const BUILDERS: Record<VehicleKind, () => BufferGeometry[]> = {
  sedan, hatch, suv, van, taxi, bus, truck, police, crew,
  pickup, minibus, coach, boxTruck, flatbed, tanker, waterTanker, reefer, tractor, semi, container20,
  carTransporter, towTruck, fireEngine, ambulance, garbage, serviceVan,
  forklift, yardTractor, reachStacker, excavator, wheelLoader, bulldozer,
  luxurySedan, coupe, crossover, largeSuv, boxSuv,
};

/** Length of each model in world units (bumper to bumper). */
export const VEHICLE_LENGTH: Record<VehicleKind, number> = {
  pickup: 5.22 * VEHICLE_SCALE, minibus: 5.62 * VEHICLE_SCALE, coach: 12.3 * VEHICLE_SCALE, boxTruck: 7.0 * VEHICLE_SCALE,
  flatbed: 6.87 * VEHICLE_SCALE, tanker: 7.37 * VEHICLE_SCALE, waterTanker: 6.87 * VEHICLE_SCALE, reefer: 6.92 * VEHICLE_SCALE,
  tractor: 3.75 * VEHICLE_SCALE, semi: 17.25 * VEHICLE_SCALE, container20: 7.17 * VEHICLE_SCALE, carTransporter: 17.25 * VEHICLE_SCALE,
  towTruck: 6.97 * VEHICLE_SCALE, fireEngine: 7.52 * VEHICLE_SCALE, ambulance: 5.32 * VEHICLE_SCALE, garbage: 7.27 * VEHICLE_SCALE,
  serviceVan: 5.47 * VEHICLE_SCALE, forklift: 3.5 * VEHICLE_SCALE, yardTractor: 3.8 * VEHICLE_SCALE, reachStacker: 11.8 * VEHICLE_SCALE,
  excavator: 10.25 * VEHICLE_SCALE, wheelLoader: 6.35 * VEHICLE_SCALE, bulldozer: 6.55 * VEHICLE_SCALE,
  sedan: 4.75 * VEHICLE_SCALE,
  luxurySedan: 5.16 * VEHICLE_SCALE,
  coupe: 4.62 * VEHICLE_SCALE,
  crossover: 4.54 * VEHICLE_SCALE,
  largeSuv: 4.96 * VEHICLE_SCALE,
  boxSuv: 4.86 * VEHICLE_SCALE,
  hatch: 4.15 * VEHICLE_SCALE,
  suv: 4.92 * VEHICLE_SCALE,
  van: 5.25 * VEHICLE_SCALE,
  taxi: 4.75 * VEHICLE_SCALE,
  bus: 12.1 * VEHICLE_SCALE,
  truck: 7.7 * VEHICLE_SCALE,
  police: 4.75 * VEHICLE_SCALE,
  crew: 6.3 * VEHICLE_SCALE,
};

/** Centre offset (model space, world units) so that the car's middle sits on its path position. */
export const VEHICLE_CENTER: Record<VehicleKind, number> = {
  pickup: 0, minibus: 0, coach: 0, boxTruck: -0.2 * VEHICLE_SCALE, flatbed: -0.4 * VEHICLE_SCALE, tanker: -0.6 * VEHICLE_SCALE,
  waterTanker: -0.5 * VEHICLE_SCALE, reefer: -0.5 * VEHICLE_SCALE, tractor: 0, semi: -2.2 * VEHICLE_SCALE, container20: -0.4 * VEHICLE_SCALE,
  carTransporter: -2.2 * VEHICLE_SCALE, towTruck: -0.4 * VEHICLE_SCALE, fireEngine: -0.5 * VEHICLE_SCALE, ambulance: 0,
  garbage: -0.4 * VEHICLE_SCALE, serviceVan: 0, forklift: 0, yardTractor: 0, reachStacker: 0, excavator: 0, wheelLoader: 0, bulldozer: 0,
  sedan: 0,
  luxurySedan: 0,
  coupe: 0,
  crossover: 0,
  largeSuv: 0,
  boxSuv: 0,
  hatch: 0,
  suv: 0,
  van: 0,
  taxi: 0,
  bus: 0,
  truck: -0.35 * VEHICLE_SCALE,
  police: 0,
  crew: 0.2 * VEHICLE_SCALE,
};

const cache = new Map<VehicleKind, BufferGeometry>();

export function vehicleGeometry(kind: VehicleKind): BufferGeometry {
  let g = cache.get(kind);
  if (!g) {
    const merged = mergeGeometries(BUILDERS[kind](), false);
    if (!merged) throw new Error(`vehicle geometry ${kind} failed to merge`);
    merged.scale(VEHICLE_SCALE, VEHICLE_SCALE, VEHICLE_SCALE);
    merged.translate(0, 0, -VEHICLE_CENTER[kind]);
    merged.computeBoundingSphere();
    g = merged;
    cache.set(kind, g);
  }
  return g;
}
