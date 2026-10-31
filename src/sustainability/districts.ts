/**
 * The twin's districts, from the extents of the named road groups in the city data (scene units, 1 = 10 m).
 * Used to break sustainability indicators down by area. Layout-derived, not official boundaries.
 */
export interface District {
  id: string;
  name: string;
  nameAr: string;
  /** x0, x1, z0, z1 */
  box: [number, number, number, number];
}

export const DISTRICTS: District[] = [
  { id: 'lagoons', name: 'Al Sajaa Lagoons', nameAr: 'بحيرات السجعة', box: [-70, 200, 36, 100] },
  { id: 'far-north', name: 'Far Northern Industrial Zone', nameAr: 'المنطقة الصناعية الشمالية البعيدة', box: [-240, 130, -240, -150] },
  { id: 'north-mixed', name: 'Northern Mixed District', nameAr: 'المنطقة الشمالية المختلطة', box: [-240, 130, -150, -80] },
  { id: 'freight-yards', name: 'Far Western Freight Yards', nameAr: 'ساحات الشحن الغربية', box: [-320, -232, -80, 36] },
  { id: 'west-logistics', name: 'Western Logistics District', nameAr: 'منطقة اللوجستيات الغربية', box: [-232, -152, -80, 36] },
  { id: 'rahmaniya', name: 'Rahmaniya', nameAr: 'الرحمانية', box: [-152, -64, -80, 36] },
  { id: 'central', name: 'Al Sajaa Central', nameAr: 'وسط السجعة', box: [-64, 120, -80, 36] },
  { id: 'east-res', name: 'Eastern Residential District', nameAr: 'المنطقة السكنية الشرقية', box: [120, 200, -80, 36] },
];

export const OTHER: District = { id: 'other', name: 'Other', nameAr: 'أخرى', box: [0, 0, 0, 0] };

export function districtAt(x: number, z: number): District {
  for (const d of DISTRICTS) {
    const [x0, x1, z0, z1] = d.box;
    if (x >= x0 && x < x1 && z >= z0 && z < z1) return d;
  }
  return OTHER;
}
