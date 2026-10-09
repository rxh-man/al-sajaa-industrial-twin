import { CanvasTexture, LinearMipmapLinearFilter, SRGBColorSpace, Vector4 } from 'three';
import { AD, AD_RECT, type XZ } from '../data/abudhabi';
import { mulberry32 } from '../data/rng';

/**
 * The street-level picture of downtown Abu Dhabi at dusk, painted once into a canvas:
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
  path(AD.land, true);
  g.fill();
  g.save();
  path(AD.land, true);
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

  const roads = [...AD.roads].sort((a, b) => ORDER.indexOf(a.c) - ORDER.indexOf(b.c));
  g.lineJoin = 'round';
  g.lineCap = 'round';

  // kerbs / sidewalks first, then asphalt on top
  for (const r of roads) {
    g.strokeStyle = r.c === 'pedestrian' ? '#86807a' : '#8c877f';
    g.lineWidth = (r.w + (MAJOR.test(r.c) ? 0.55 : 0.3)) * PX;
    path(r.p);
    g.stroke();
  }
  for (const r of roads) {
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
  g.setLineDash([]);
  g.restore();

  texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  return texture;
}
