import { BufferGeometry, Float32BufferAttribute, Vector3 } from 'three';

/**
 * The roof part of a unit building geometry: every triangle whose centre lies at or above the roof
 * line (unit y = roofY). Walls, canopies and other add-ons below the roof line are dropped, and
 * roof-mounted parts (pitched slopes, domes, parapet rims) are kept, whatever their tilt. Triangles
 * are kept by position, not winding, so the result does not depend on how the mesh was built.
 * Pure three.js, so it can be tested without a browser.
 */
export function roofZoneTriangles(src: BufferGeometry, roofY: number): BufferGeometry {
  const g = src.index ? src.toNonIndexed() : src;
  const pos = g.getAttribute('position');
  const out: number[] = [];
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  const n = new Vector3();
  const ab = new Vector3();
  const ac = new Vector3();
  for (let i = 0; i + 2 < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    if (n.crossVectors(ab, ac).lengthSq() === 0) continue;
    const centreY = (a.y + b.y + c.y) / 3;
    if (centreY >= roofY - 1e-3) out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
  }
  const r = new BufferGeometry();
  r.setAttribute('position', new Float32BufferAttribute(out, 3));
  return r;
}
