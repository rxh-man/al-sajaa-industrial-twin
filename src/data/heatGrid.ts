import { AD } from './abudhabi';
import { FACTORIES, SHADE_TREES } from './airClimate';

/**
 * SIMULATED relative heat grid over the scene rectangle (1 cell = 1 scene unit = 10 m).
 * Built from road class density, factory emissions and shade trees, on top of an open-land baseline.
 * Values are relative 0–1 for colouring. They are not temperatures.
 */

const R = AD.meta.rect;
export const GRID_W = Math.round(R.maxX - R.minX);
export const GRID_H = Math.round(R.maxZ - R.minZ);
const cells = new Float32Array(GRID_W * GRID_H);

const cellOf = (x: number, z: number) => {
  const i = Math.floor(x - R.minX);
  const j = Math.floor(z - R.minZ);
  if (i < 0 || j < 0 || i >= GRID_W || j >= GRID_H) return -1;
  return j * GRID_W + i;
};

const ROAD_W: Record<string, number> = { motorway: 3, trunk: 2.5, primary: 2, secondary: 1.5, tertiary: 1 };

// open land baseline
cells.fill(0.5);

// roads: heat from traffic class
for (const r of AD.roads) {
  if (r.c === 'rail') continue;
  const w = ROAD_W[r.c] ?? 0.5;
  for (let i = 1; i < r.p.length; i++) {
    const [x0, z0] = r.p[i - 1];
    const [x1, z1] = r.p[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.5));
    for (let s = 0; s <= steps; s++) {
      const k = cellOf(x0 + ((x1 - x0) * s) / steps, z0 + ((z1 - z0) * s) / steps);
      if (k >= 0) cells[k] += w * 0.6;
    }
  }
}

// factories: a radial plume, stronger with more pollutant types
const FR = 12;
for (const f of FACTORIES) {
  const amp = 1.5 + (f.levels.reduce((a, l) => a + l, 0) / 12) * 2;
  for (let dz = -FR; dz <= FR; dz++) {
    for (let dx = -FR; dx <= FR; dx++) {
      const d2 = dx * dx + dz * dz;
      if (d2 > FR * FR) continue;
      const k = cellOf(f.x + dx, f.z + dz);
      if (k >= 0) cells[k] += amp * Math.exp(-d2 / (2 * 5 * 5));
    }
  }
}

// shade trees cool their surroundings
for (const t of SHADE_TREES) {
  for (let dz = -3; dz <= 3; dz++) {
    for (let dx = -3; dx <= 3; dx++) {
      if (dx * dx + dz * dz > 9) continue;
      const k = cellOf(t.x + dx, t.z + dz);
      if (k >= 0) cells[k] = Math.max(0, cells[k] - 0.25);
    }
  }
}

let max = 0.0001;
for (const v of cells) if (v > max) max = v;
for (let i = 0; i < cells.length; i++) cells[i] = cells[i] / max;

/** relative heat 0–1 at a scene point */
export function heatAt(x: number, z: number): number {
  const k = cellOf(x, z);
  return k < 0 ? 0 : cells[k];
}

export const HEAT_CELLS = cells;

/** colour ramp: cool blue, yellow, red */
export function heatColor(t: number): [number, number, number] {
  const c = Math.min(1, Math.max(0, t));
  const stops: [number, number, number][] = [
    [31, 79, 122],
    [231, 194, 74],
    [217, 71, 43],
  ];
  const s = c < 0.5 ? 0 : 1;
  const u = c < 0.5 ? c / 0.5 : (c - 0.5) / 0.5;
  const a = stops[s];
  const b = stops[s + 1];
  return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
}
