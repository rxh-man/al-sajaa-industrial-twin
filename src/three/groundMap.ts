import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace, Vector4 } from 'three';
import { AD, AD_RECT, LAND_POLYS, UNNAMED_COAST_ROAD, type XZ } from '../data/abudhabi';
import { mulberry32 } from '../data/rng';
import PARKING from '../data/parking.json';
import { STREETSCAPE } from '../data/streetscapeData';
import { trackPath } from '../data/railLayout';
import { ALSAJAA_INLAND } from '../config/overrides';

/**
 * The street-level picture of the Al Sajaa district at dusk, painted once into a canvas:
 * paving, parks, real road shapes and UAE-style markings (yellow edge line on the
 * median side, white on the kerb side, dashed lane lines). Transparent where the
 * sea is, so the ground shader can cut the coastline out of the slab.
 */

const PX = 16; // pixels per scene unit (1.6 px per metre)
const W = AD_RECT.maxX - AD_RECT.minX;
const H = AD_RECT.maxZ - AD_RECT.minZ;

/** xy = rect min, zw = 1 / size; the shader turns world xz into texture uv with it. */
export const GROUND_RECT = new Vector4(AD_RECT.minX, AD_RECT.minZ, 1 / W, 1 / H);

const ORDER = ['pedestrian', 'living_street', 'service', 'residential', 'unclassified', 'tertiary', 'secondary', 'primary', 'trunk'];
const MAJOR = /^(trunk|primary|secondary|tertiary)$/;

/** inland Al Sajaa: the land is the whole map rectangle, so no coastline edge is painted */
const LAND = ALSAJAA_INLAND
  ? [[[AD_RECT.minX, AD_RECT.minZ], [AD_RECT.maxX, AD_RECT.minZ], [AD_RECT.maxX, AD_RECT.maxZ], [AD_RECT.minX, AD_RECT.maxZ]] as XZ[]]
  : LAND_POLYS;

let texture: CanvasTexture | null = null;

export function groundTexture() {
  if (texture) return texture;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(W * PX);
  canvas.height = Math.round(H * PX);
  const g = canvas.getContext('2d')!;
  const X = (x: number) => (x - AD_RECT.minX) * PX;
  const Y = (z: number) => (z - AD_RECT.minZ) * PX;
  const path = (pts: XZ[], close = false) => {
    g.beginPath();
    pts.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))));
    if (close) g.closePath();
  };
  /** one line offset sideways from a road's centre line (segment by segment) */
  const offsetLine = (pts: XZ[], off: number) => {
    g.beginPath();
    for (let i = 1; i < pts.length; i++) {
      const [ax, az] = pts[i - 1];
      const [bx, bz] = pts[i];
      const L = Math.hypot(bx - ax, bz - az) || 1;
      const nx = (-(bz - az) / L) * off;
      const nz = ((bx - ax) / L) * off;
      g.moveTo(X(ax + nx), Y(az + nz));
      g.lineTo(X(bx + nx), Y(bz + nz));
    }
    g.stroke();
  };

  // land: warm grey paving (the twin's dusk palette; the lighting does the rest)
  g.fillStyle = '#77726a';
  for (const poly of LAND) {
    path(poly, true);
    g.fill();
  }
  g.save();
  g.beginPath();
  for (const poly of LAND) {
    poly.forEach(([x, z], i) => (i ? g.lineTo(X(x), Y(z)) : g.moveTo(X(x), Y(z))));
    g.closePath();
  }
  g.clip();

  // block surfaces get a faint mottling so large plazas don't read as flat
  const rnd = mulberry32(7);
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * canvas.width;
    const y = rnd() * canvas.height;
    g.fillStyle = rnd() < 0.5 ? 'rgba(40,34,26,0.07)' : 'rgba(255,246,230,0.035)';
    g.fillRect(x, y, 6 + rnd() * 40, 6 + rnd() * 40);
  }

  // parks and lawns
  g.fillStyle = '#4b6a39';
  for (const p of AD.parks) {
    path(p.p, true);
    g.fill();
  }

  // inland Al Sajaa: the unnamed coast-side road is not painted (its traffic link stays, so cars keep moving)
  // raised roads are drawn as decks (ElevatedRoads.tsx), not painted on the ground beneath them
  const roads = [...AD.roads]
    .filter((r) => !(ALSAJAA_INLAND && r.n === UNNAMED_COAST_ROAD) && r.o !== 1)
    .sort((a, b) => ORDER.indexOf(a.c) - ORDER.indexOf(b.c));
  g.lineJoin = 'round';
  g.lineCap = 'round';

  // kerbs / sidewalks first, then asphalt on top
  for (const r of roads) {
    if (r.c === 'rail') continue; // drawn as track below, never as a road
    g.strokeStyle = r.c === 'pedestrian' ? '#86807a' : '#8c877f';
    g.lineWidth = (r.w + (MAJOR.test(r.c) ? 0.55 : 0.3)) * PX;
    path(r.p);
    g.stroke();
  }
  for (const r of roads) {
    if (r.c === 'rail') continue;
    g.strokeStyle = r.c === 'pedestrian' ? '#7c766d' : MAJOR.test(r.c) ? '#2c2e33' : '#34363b';
    g.lineWidth = r.w * PX;
    path(r.p);
    g.stroke();
  }

  // markings on the bigger roads
  g.lineCap = 'butt';
  for (const r of roads) {
    if (!MAJOR.test(r.c) && r.c !== 'unclassified') continue;
    const hw = r.w / 2 - 0.08;
    if (r.o) {
      const lanes = Math.max(1, Math.round((r.w * 10 - 1) / 3.4));
      g.setLineDash([]);
      g.lineWidth = 1.2;
      g.strokeStyle = 'rgba(214,170,58,0.85)'; // yellow: median side (left of travel)
      offsetLine(r.p, hw);
      g.strokeStyle = 'rgba(236,236,232,0.75)'; // white: kerb side
      offsetLine(r.p, -hw);
      g.setLineDash([0.3 * PX, 0.6 * PX]);
      for (let i = 1; i < lanes; i++) offsetLine(r.p, -hw + (2 * hw * i) / lanes);
    } else {
      g.setLineDash([0.3 * PX, 0.5 * PX]);
      g.lineWidth = 1.1;
      g.strokeStyle = 'rgba(236,236,232,0.7)';
      offsetLine(r.p, 0);
    }
  }
  // station parking: asphalt, stall rows with an aisle between each pair, an access lane off E88
  // and a pedestrian link to the rail access street (geometry from src/data/parking.json)
  const [px0, pz0, px1, pz1] = PARKING.rect;
  g.lineCap = 'butt';
  g.setLineDash([]);
  g.fillStyle = '#3a3c41';
  g.fillRect(X(px0), Y(pz0), (px1 - px0) * PX, (pz1 - pz0) * PX);
  g.strokeStyle = 'rgba(236,236,232,0.85)';
  g.lineWidth = 1.2;
  const aisle = 0.8;
  const block = 2 * PARKING.bayDepth + aisle;
  for (let zt = pz0; zt + block <= pz1 + 1e-6; zt += block) {
    const rowA = zt;
    const rowAEnd = zt + PARKING.bayDepth;
    const rowB = zt + PARKING.bayDepth + aisle;
    const rowBEnd = zt + block;
    // stall boundaries across each row, and the aisle edges
    for (const z of [rowA, rowAEnd, rowB, rowBEnd]) {
      g.beginPath();
      g.moveTo(X(px0), Y(z));
      g.lineTo(X(px1), Y(z));
      g.stroke();
    }
    // stall dividers within each row
    for (let x = px0; x <= px1 + 1e-6; x += PARKING.bayPitch) {
      g.beginPath();
      g.moveTo(X(x), Y(rowA));
      g.lineTo(X(x), Y(rowAEnd));
      g.moveTo(X(x), Y(rowB));
      g.lineTo(X(x), Y(rowBEnd));
      g.stroke();
    }
  }
  g.strokeStyle = '#34363b';
  g.lineWidth = PARKING.accessWidth * PX;
  path(PARKING.access as XZ[]);
  g.stroke();
  g.strokeStyle = 'rgba(236,236,232,0.8)';
  g.lineWidth = PARKING.walkWidth * PX;
  g.setLineDash([0.12 * PX, 0.12 * PX]);
  path(PARKING.walk as XZ[]);
  g.stroke();
  g.setLineDash([]);

  // streetscape paint (src/data/streetscape.ts): car parks with bay lines, villa driveways, loading aprons, bus bays
  const patch = (p: { x: number; z: number; yaw: number; len: number; wid: number }, fill: string) => {
    g.save();
    g.translate(X(p.x), Y(p.z));
    // yaw is the heading about +y: the long axis runs along (sin yaw, cos yaw) in xz, i.e. canvas (sin, cos)
    g.rotate(Math.atan2(Math.cos(p.yaw), Math.sin(p.yaw)));
    g.fillStyle = fill;
    g.fillRect((-p.len / 2) * PX, (-p.wid / 2) * PX, p.len * PX, p.wid * PX);
    g.restore();
  };
  for (const lot of STREETSCAPE.lots) {
    g.fillStyle = '#3a3c41';
    g.fillRect(X(lot.x0), Y(lot.z0), (lot.x1 - lot.x0) * PX, (lot.z1 - lot.z0) * PX);
    g.strokeStyle = 'rgba(236,236,232,0.8)';
    g.lineWidth = 1.1;
    const [a0, a1] = lot.alongX ? [lot.x0 + 0.25, lot.x1 - 0.25] : [lot.z0 + 0.25, lot.z1 - 0.25];
    for (const [r0, r1] of lot.rows) {
      g.beginPath();
      for (let q = a0; q <= a1 + 1e-6; q += lot.pitch) {
        if (lot.alongX) {
          g.moveTo(X(q), Y(r0));
          g.lineTo(X(q), Y(r1));
        } else {
          g.moveTo(X(r0), Y(q));
          g.lineTo(X(r1), Y(q));
        }
      }
      g.stroke();
    }
  }
  for (const d of STREETSCAPE.driveways) patch(d, '#b9ad98');
  for (const a of STREETSCAPE.aprons) patch(a, '#8f8a82');
  for (const b of STREETSCAPE.busBays) {
    patch(b, 'rgba(214,170,58,0.9)');
    patch({ ...b, len: b.len - 0.06, wid: b.wid - 0.06 }, '#2c2e33');
  }

  // rail: per track (src/data/railLayout.ts), a ballast bed, sleepers and two rails
  g.lineCap = 'butt';
  for (const id of ['westbound', 'eastbound'] as const) {
    const tp = trackPath(id);
    if (tp.length < 2) continue;
    g.setLineDash([]);
    g.strokeStyle = '#5f5b54';
    g.lineWidth = 0.62 * PX;
    path(tp);
    g.stroke();
    g.strokeStyle = '#3f3a33';
    g.lineWidth = 0.45 * PX;
    g.setLineDash([0.12 * PX, 0.2 * PX]);
    path(tp);
    g.stroke();
    g.setLineDash([]);
    g.strokeStyle = '#d6d2c9';
    g.lineWidth = 1.4;
    offsetLine(tp, 0.12);
    offsetLine(tp, -0.12);
  }
  g.setLineDash([]);
  g.restore();

  texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  return texture;
}
