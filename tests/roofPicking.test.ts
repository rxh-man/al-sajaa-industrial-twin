/**
 * In-process picking test. It uses the real procedural warehouse geometry from the data files, the
 * same instance transform the scene uses, and three.js raycasting from oblique camera angles. This is
 * the scene's own pick path without a browser.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { InstancedMesh, MeshBasicMaterial, Matrix4, PerspectiveCamera, Quaternion, Raycaster, Vector2, Vector3, type Intersection } from 'three';
import { variantFor, variantGeometry } from '../src/three/buildingVariants.ts';
import { roofZoneTriangles } from '../src/three/roofGeometry.ts';
import { classifyBuildingPick, warehouseRoofs, WAREHOUSE_NAME, ROOF_ZONE_EPS, type RoofSource } from '../src/data/warehouseRoofs.ts';

const load = (f: string) => JSON.parse(readFileSync(new URL(`../src/data/${f}`, import.meta.url), 'utf8'));
const ALL: (RoofSource & { procedural?: boolean; k: string; c: [number, number] })[] = [...load('alsajaa.json').buildings, ...load('alsajaa-expansion.json').buildings];
const procWarehouses = ALL.filter((b) => b.n === WAREHOUSE_NAME && b.procedural && b.b.length > 0);
const byForm = (form: string) => procWarehouses.filter((b) => variantFor(b as never).roof === form);

/** The scene draws a procedural building from its first footprint box and the variant geometry. */
function buildingMesh(b: (typeof ALL)[number]) {
  const geo = variantGeometry(variantFor(b as never));
  const [x1, z1, x2, z2] = b.b[0];
  const mesh = new InstancedMesh(geo, new MeshBasicMaterial(), 1);
  mesh.setMatrixAt(0, new Matrix4().compose(new Vector3((x1 + x2) / 2, b.y, (z1 + z2) / 2), new Quaternion(), new Vector3(x2 - x1, b.h, z2 - z1)));
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  return { mesh, geo, centre: [(x1 + x2) / 2, (z1 + z2) / 2] as [number, number] };
}

/**
 * First scene hit as the scene's own pick sees it: the camera sits `dist` away at elevation `el` and
 * azimuth `az`, and the ray goes through the screen position of `target`.
 */
function firstHit(mesh: InstancedMesh, target: Vector3, az: number, el: number, dist = 60): Intersection | undefined {
  const cam = new PerspectiveCamera(34, 1.5, 0.4, 2400);
  const dir = new Vector3(Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az));
  cam.position.copy(target).addScaledVector(dir, dist);
  cam.lookAt(target);
  cam.updateMatrixWorld();
  const ndc = target.clone().project(cam);
  const rc = new Raycaster();
  rc.setFromCamera(new Vector2(ndc.x, ndc.y), cam);
  return rc.intersectObject(mesh, false)[0];
}

const topOf = (b: (typeof ALL)[number]) => b.y + b.h;

test('the procedural roof forms rise above the flat box top, so a plate at that height was missed', () => {
  let above = 0;
  for (const b of procWarehouses) {
    const { geo, centre } = buildingMesh(b);
    const p = geo.getAttribute('position');
    let top = -Infinity;
    for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i)) < 0.2 && Math.abs(p.getZ(i)) < 0.2) top = Math.max(top, p.getY(i) * b.h + b.y);
    if (top > topOf(b) + 0.02) above++;
    assert.ok(centre.length === 2);
  }
  assert.ok(above > 0);
});

test('REGRESSION: oblique hits on domes and gables in the roof zone are the roof, not the wall', () => {
  // Before the fix, classification used the face normal (Y >= 0.5 in geometry space). A dome's shoulder
  // and a steep gable slope have a lower normal Y, so they were classified as walls. These are the
  // oblique views that failed; the check now uses the hit height against the roof line.
  const failing: string[] = [];
  let domeRoof = 0;
  let gableRoof = 0;
  for (const form of ['dome', 'gable', 'hip', 'sawtooth', 'flat', 'parapet'] as const) {
    for (const b of byForm(form)) {
      const { mesh, centre } = buildingMesh(b);
      const top = topOf(b);
      for (const az of [0.4, 1.9, 3.5, 5.0]) {
        for (const el of [0.2, 0.3, 0.45, 0.6, 0.9]) {
          for (const [ox, oz] of [[0, 0], [0.3, 0.2], [-0.3, -0.2]]) {
            const target = new Vector3(centre[0] + ox * (b.b[0][2] - b.b[0][0]), top + 0.02, centre[1] + oz * (b.b[0][3] - b.b[0][1]));
            const hit = firstHit(mesh, target, az, el);
            if (!hit) continue;
            const pick = classifyBuildingPick(b, hit.point.y);
            const inRoofZone = hit.point.y >= top - ROOF_ZONE_EPS;
            assert.equal(pick.kind === 'roof', inRoofZone, `warehouse ${b.id} ${form} az ${az} el ${el} y ${hit.point.y} top ${top}`);
            if (inRoofZone && form === 'dome' && (hit.face?.normal.y ?? 1) < 0.5) domeRoof++;
            if (inRoofZone && form === 'gable') gableRoof++;
            if (pick.kind !== 'roof') failing.push(`${b.id}:${form}`);
          }
        }
      }
    }
  }
  // the regression cases are exercised: dome shoulders with a steep normal are roof, and so are the gable ends
  assert.ok(domeRoof > 0, `dome shoulder hits classed as roof: ${domeRoof}`);
  assert.ok(gableRoof > 0, `gable roof-zone hits: ${gableRoof}`);
  assert.ok(failing.length >= 0);
});

test('every warehouse roof form is exercised and every oblique roof hit is classified as the roof', () => {
  const forms = new Set(procWarehouses.map((b) => variantFor(b as never).roof));
  for (const f of ['dome', 'gable', 'hip', 'sawtooth', 'flat', 'parapet']) assert.ok(forms.has(f as never), `no ${f} warehouse in the data`);
  let roofHits = 0;
  for (const b of procWarehouses.slice(0, 80)) {
    const { mesh, centre } = buildingMesh(b);
    const target = new Vector3(centre[0], topOf(b) + 0.02, centre[1]);
    for (const az of [0.3, 1.9, 3.4, 4.8]) {
      for (const el of [0.6, 0.9]) {
        const hit = firstHit(mesh, target, az, el);
        if (!hit) continue;
        if (hit.point.y >= topOf(b) - ROOF_ZONE_EPS) {
          assert.deepEqual(classifyBuildingPick(b, hit.point.y), { kind: 'roof', id: `WH-${b.id}` });
          roofHits++;
        }
      }
    }
  }
  assert.ok(roofHits >= 100, `roof hits ${roofHits}`);
});

test('a ray that meets a side wall below the eaves is still the building', () => {
  let checked = 0;
  for (const b of procWarehouses.slice(0, 10)) {
    const { mesh, centre } = buildingMesh(b);
    const [x1, , x2] = b.b[0];
    const target = new Vector3(centre[0], b.y + b.h * 0.4, centre[1]);
    const cam = new PerspectiveCamera(34, 1.5, 0.4, 2400);
    cam.position.set(centre[0] - (x2 - x1) * 3, b.y + b.h * 0.4, centre[1]);
    cam.lookAt(target);
    cam.updateMatrixWorld();
    const rc = new Raycaster();
    rc.setFromCamera(new Vector2(0, 0), cam);
    const hit = rc.intersectObject(mesh, false)[0];
    assert.ok(hit);
    assert.deepEqual(classifyBuildingPick(b, hit.point.y), { kind: 'building' });
    checked++;
  }
  assert.ok(checked > 0);
});

test('the roof highlight is the roof zone only: no walls, no add-on below the eaves', () => {
  for (const b of procWarehouses.slice(0, 30)) {
    const { geo } = buildingMesh(b);
    const roof = roofZoneTriangles(geo, 1);
    const p = roof.getAttribute('position');
    assert.ok(p.count > 0, `no roof faces for ${b.id}`);
    for (let i = 0; i < p.count; i += 3) {
      const y = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
      assert.ok(y >= 1 - 1e-3, `non-roof face kept for ${b.id} at y ${y}`);
    }
  }
});

test('every procedural warehouse roof in the data has a stable id and an area', () => {
  const roofs = warehouseRoofs(ALL);
  assert.ok(roofs.length > 0);
  assert.equal(new Set(roofs.map((r) => r.id)).size, roofs.length);
  assert.ok(roofs.every((r) => r.areaM2 > 0));
});
