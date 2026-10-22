import { useLayoutEffect, useMemo, useRef } from 'react';
import { BufferGeometry, Color, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';
import { YARD_EQUIPMENT, type YardItem } from '../data/yardEquipment';
import { vehicleGeometry, type VehicleKind } from './vehicles/vehicleModels';
import { createStateAttribute, createVehicleMaterial } from './vehicles/vehicleMaterial';

/** Body colours for the yard fleet: white, yard blue, safety yellow, grey. */
const PAINT = ['#f1f2f4', '#2f5f9a', '#e0b23a', '#8a8f96'].map((c) => new Color(c));

/**
 * Parked industrial equipment in the expansion yards. One instanced mesh per vehicle kind,
 * reusing the same procedural vehicle geometry and vehicle material as the traffic fleet.
 */
export function YardEquipment() {
  const material = useMemo(() => createVehicleMaterial('#e0b23a'), []);
  const groups = useMemo(() => {
    const map = new Map<VehicleKind, YardItem[]>();
    for (const it of YARD_EQUIPMENT) map.set(it.kind, [...(map.get(it.kind) ?? []), it]);
    return [...map.entries()];
  }, []);
  return (
    <group>
      {groups.map(([kind, items]) => (
        <YardKind key={kind} kind={kind} items={items} material={material} />
      ))}
    </group>
  );
}

function YardKind({ kind, items, material }: { kind: VehicleKind; items: YardItem[]; material: ReturnType<typeof createVehicleMaterial> }) {
  const ref = useRef<InstancedMesh>(null);
  const geometry = useMemo(() => {
    const base = vehicleGeometry(kind);
    const g = new BufferGeometry();
    for (const name of Object.keys(base.attributes)) g.setAttribute(name, base.getAttribute(name));
    g.setAttribute('aState', createStateAttribute(items.length) as InstancedBufferAttribute);
    g.boundingSphere = base.boundingSphere;
    return g;
  }, [kind, items]);

  useLayoutEffect(() => {
    const mesh = ref.current!;
    const m = new Matrix4();
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0);
    items.forEach((it, i) => {
      q.setFromAxisAngle(up, it.yaw);
      m.compose(new Vector3(it.x, 0, it.z), q, new Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, PAINT[it.paint % PAINT.length]);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [items]);

  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow receiveShadow raycast={() => {}} />;
}

