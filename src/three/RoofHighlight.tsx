import { useMemo } from 'react';
import { BoxGeometry, BufferGeometry, DoubleSide, Matrix4, Quaternion, Vector3, type Intersection, type Raycaster } from 'three';
import { AD, type AdBuilding } from '../data/abudhabi';
import { WAREHOUSE_NAME, roofAssetId } from '../data/warehouseRoofs';
import { variantFor, variantGeometry } from './buildingVariants';
import { roofZoneTriangles } from './roofGeometry';

const noRaycast = (_r: Raycaster, _i: Intersection[]) => {};

/** Warehouse buildings by their stable roof id. */
const WAREHOUSE_BY_ROOF = new Map<string, AdBuilding>(AD.buildings.filter((b) => b.n === WAREHOUSE_NAME && b.b.length > 0).map((b) => [roofAssetId(b.id), b]));

/** Roof surfaces for a warehouse, positioned in the scene the same way its building mesh is. */
function roofParts(roofId: string): { geometry: BufferGeometry; matrix: Matrix4 }[] {
  const b = WAREHOUSE_BY_ROOF.get(roofId);
  if (!b) return [];
  const q = new Quaternion();
  const parts: { geometry: BufferGeometry; matrix: Matrix4 }[] = [];
  if (b.procedural) {
    // procedural buildings are drawn from their first footprint box and the variant geometry
    const [x1, z1, x2, z2] = b.b[0];
    const matrix = new Matrix4().compose(new Vector3((x1 + x2) / 2, b.y, (z1 + z2) / 2), q, new Vector3(x2 - x1, b.h, z2 - z1));
    parts.push({ geometry: roofZoneTriangles(variantGeometry(variantFor(b)), 1), matrix });
    return parts;
  }
  // box shells: one unit box per footprint box (its top sits at unit y = 1), lifted to base y and scaled to the building height
  const unit = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const roofOnly = roofZoneTriangles(unit, 1);
  for (const [x1, z1, x2, z2] of b.b) {
    parts.push({ geometry: roofOnly, matrix: new Matrix4().compose(new Vector3((x1 + x2) / 2, b.y, (z1 + z2) / 2), q, new Vector3(x2 - x1, b.h, z2 - z1)) });
  }
  return parts;
}

/**
 * Highlights the roof surfaces of one warehouse. The highlight is built from the same geometry the
 * building is drawn with, so it follows pitched and add-on roofs and does not float above them.
 */
export function RoofHighlight({ roofId, color, opacity }: { roofId: string; color: string; opacity: number }) {
  const parts = useMemo(() => roofParts(roofId), [roofId]);
  return (
    <group>
      {parts.map((p, i) => (
        <mesh key={i} geometry={p.geometry} matrix={p.matrix} matrixAutoUpdate={false} raycast={noRaycast} renderOrder={7}>
          <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} side={DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
      ))}
    </group>
  );
}
