import { useLayoutEffect, useRef } from 'react';
import { Object3D, type InstancedMesh } from 'three';
import { EV_BAYS } from '../data/evCharging';

/** EV charging posts and green-marked bays in the parking lots (src/data/evCharging.ts). Two instanced draws. */
const noRaycast = () => {};
const tmp = new Object3D();

export function EvCharging() {
  const posts = useRef<InstancedMesh>(null);
  const bays = useRef<InstancedMesh>(null);
  useLayoutEffect(() => {
    EV_BAYS.forEach((b, i) => {
      tmp.position.set(b.px, 0.09, b.pz);
      tmp.rotation.set(0, b.alongX ? 0 : Math.PI / 2, 0);
      tmp.scale.set(0.07, 0.18, 0.05);
      tmp.updateMatrix();
      posts.current?.setMatrixAt(i, tmp.matrix);
      tmp.position.set(b.x, 0.013, b.z);
      tmp.rotation.set(-Math.PI / 2, 0, b.alongX ? 0 : Math.PI / 2);
      tmp.scale.set(0.34, 0.74, 1);
      tmp.updateMatrix();
      bays.current?.setMatrixAt(i, tmp.matrix);
    });
    for (const m of [posts.current, bays.current]) if (m) (m.instanceMatrix.needsUpdate = true), m.computeBoundingSphere();
  }, []);
  if (!EV_BAYS.length) return null;
  return (
    <group>
      <instancedMesh ref={posts} args={[undefined, undefined, EV_BAYS.length]} raycast={noRaycast} castShadow>
        <boxGeometry />
        <meshStandardMaterial color="#e9edf0" emissive="#22c55e" emissiveIntensity={0.35} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={bays} args={[undefined, undefined, EV_BAYS.length]} raycast={noRaycast} receiveShadow>
        <planeGeometry />
        <meshStandardMaterial color="#2f9e5b" roughness={0.9} transparent opacity={0.55} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
      </instancedMesh>
    </group>
  );
}
