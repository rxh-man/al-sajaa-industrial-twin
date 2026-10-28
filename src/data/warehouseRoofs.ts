/**
 * Warehouse roofs: stable identifiers and roof geometry, derived from the building layout.
 * Pure functions only (no imports of JSON or 3D code), so they can be unit-tested directly.
 * Scene units: 1 = 10 m.
 */

export const WAREHOUSE_NAME = 'Logistics warehouse';

export type Box = [number, number, number, number];

/** The subset of an Abu Dhabi/Al Sajaa building record that roof logic needs. */
export interface RoofSource {
  id: number;
  n: string;
  y: number;
  h: number;
  b: Box[];
}

export interface WarehouseRoof {
  /** Stable asset id, derived from the building's own id in the data file (never from array position). */
  id: string;
  buildingId: number;
  boxes: Box[];
  /** Roof height above ground, scene units. */
  topY: number;
  /** Centre of the footprint, scene x/z. */
  centre: [number, number];
  /** Footprint area in m². */
  areaM2: number;
}

export const roofAssetId = (buildingId: number) => `WH-${buildingId}`;

/** Footprint area of a set of boxes, in m² (1 unit = 10 m, so 1 unit² = 100 m²). */
export function boxesAreaM2(boxes: Box[]): number {
  return boxes.reduce((a, [x0, z0, x1, z1]) => a + Math.abs(x1 - x0) * 10 * Math.abs(z1 - z0) * 10, 0);
}

/** All warehouse roofs in a building list, sorted by stable id. Buildings without footprint are skipped. */
export function warehouseRoofs(buildings: readonly RoofSource[]): WarehouseRoof[] {
  const out: WarehouseRoof[] = [];
  const seen = new Set<number>();
  for (const b of buildings) {
    if (b.n !== WAREHOUSE_NAME || b.b.length === 0 || seen.has(b.id)) continue;
    seen.add(b.id);
    let cx = 0;
    let cz = 0;
    let area = 0;
    for (const [x0, z0, x1, z1] of b.b) {
      const a = Math.abs(x1 - x0) * Math.abs(z1 - z0);
      cx += ((x0 + x1) / 2) * a;
      cz += ((z0 + z1) / 2) * a;
      area += a;
    }
    out.push({
      id: roofAssetId(b.id),
      buildingId: b.id,
      boxes: b.b,
      topY: b.y + b.h,
      centre: area > 0 ? [cx / area, cz / area] : [(b.b[0][0] + b.b[0][2]) / 2, (b.b[0][1] + b.b[0][3]) / 2],
      areaM2: boxesAreaM2(b.b),
    });
  }
  return out.sort((a, b) => a.buildingId - b.buildingId);
}

/**
 * Roof area that feeds the solar model: the total eligible roof area less any warehouse roofs the
 * user has excluded. Never negative, so excluding every roof gives zero, not a negative generation.
 */
export function solarRoofAreaM2(totalM2: number, roofs: readonly WarehouseRoof[], excluded: readonly string[]): number {
  return Math.max(0, totalM2 - excludedRoofAreaM2(roofs, excluded));
}

/** Summed roof area of the roofs whose ids are in `excluded`. Unknown ids contribute nothing. */
export function excludedRoofAreaM2(roofs: readonly WarehouseRoof[], excluded: readonly string[]): number {
  const set = new Set(excluded);
  return roofs.reduce((a, r) => (set.has(r.id) ? a + r.areaM2 : a), 0);
}

/**
 * How far below the roof line a hit may be and still count as roof, in scene units (0.2 m).
 * Covers float error on flat roofs without reaching into the wall below the eaves.
 */
export const ROOF_ZONE_EPS = 0.02;

export type PickResult = { kind: 'roof'; id: string } | { kind: 'building' };

/**
 * Roof or wall, decided by where the ray meets the building, not by the face normal.
 * A hit at or above the roof line is roof: flat tops, parapet rims, the shoulder of a dome and
 * the slopes of gables and hips, whatever their tilt. A hit below the roof line is the building:
 * walls, canopies, bays and balconies. Add-on tops below the roof line are never roof.
 *
 * @param building  the hit building (its id, name and the box top: y + h)
 * @param pointY    the hit point's height in world scene units (ray hit point, not face normal)
 */
export function classifyBuildingPick(building: { id: number; n: string; y: number; h: number }, pointY: number | undefined): PickResult {
  if (building.n === WAREHOUSE_NAME && pointY !== undefined && Number.isFinite(pointY) && pointY >= building.y + building.h - ROOF_ZONE_EPS) {
    return { kind: 'roof', id: roofAssetId(building.id) };
  }
  return { kind: 'building' };
}
