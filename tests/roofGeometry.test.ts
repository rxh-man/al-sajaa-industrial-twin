import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, BufferGeometry, Vector3 } from 'three';
import { roofZoneTriangles } from '../src/three/roofGeometry.ts';

const triCentres = (g: BufferGeometry) => {
  const p = g.getAttribute('position');
  const out: Vector3[] = [];
  for (let i = 0; i + 2 < p.count; i += 3) {
    out.push(new Vector3().fromBufferAttribute(p, i).add(new Vector3().fromBufferAttribute(p, i + 1)).add(new Vector3().fromBufferAttribute(p, i + 2)).multiplyScalar(1 / 3));
  }
  return out;
};

test('a box keeps only its top face (two triangles), not the walls or bottom', () => {
  const unit = new BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const roof = roofZoneTriangles(unit, 1);
  assert.equal(roof.getAttribute('position').count, 6);
  for (const c of triCentres(roof)) assert.ok(Math.abs(c.y - 1) < 1e-6);
});
